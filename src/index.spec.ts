const HTTP_STATUS_SUCCESS = 200
const HTTP_STATUS_ERROR = 500

const DEFAULT_REQUEST_OPTIONS = {
  owner: 'Someone',
  repo: 'repo',
  pull_number: 123,
}

type MockContextSpies = {
  setFailedSpy: jest.SpyInstance
  errorSpy: jest.SpyInstance
  prUpdateSpy: jest.SpyInstance
}

async function mockContext(options: {
  branch: string
  ticket?: string
  prTitle?: string
  prBody?: string
  jiraAccount?: string
  ticketRegex?: string
  ticketRegexFlags?: string
  exceptionRegex?: string
  cleanTitleRegex?: string
  preview?: string
  updateStatus?: number
  contextRepoObject?: null | { owner: string; repo: string }
  hasPullRequestContext?: boolean
}): Promise<MockContextSpies> {
  const {
    branch,
    prTitle = options.ticket ? `[${options.ticket}] - title` : 'title',
    prBody = 'body',
    jiraAccount = 'account',
    ticketRegex = /(\[([A-Z]+-\d+|HOTFIX|ADHOC)\] -)|WIP/,
    updateStatus = HTTP_STATUS_SUCCESS,
    contextRepoObject = {
      owner: DEFAULT_REQUEST_OPTIONS.owner,
      repo: DEFAULT_REQUEST_OPTIONS.repo,
    },
    hasPullRequestContext = true,
  } = options
  const setFailedSpy = jest.fn()
  const errorSpy = jest.fn()
  const prUpdateSpy = jest.fn(() => ({ status: updateStatus }))

  jest.doMock('@actions/core', () => ({
    getInput: jest.fn((input: string) => {
      if (input === 'github-token') return 'abc123'
      if (input === 'jira-account') return jiraAccount
      if (input === 'ticket-regex') return ticketRegex
      return ''
    }),
    setFailed: setFailedSpy,
    error: errorSpy,
  }))
  jest.doMock('@actions/github', () => ({
    context: {
      payload: {
        pull_request: hasPullRequestContext
          ? {
              title: prTitle,
              body: prBody,
              number: DEFAULT_REQUEST_OPTIONS.pull_number,
              head: {
                ref: branch,
              },
            }
          : undefined,
      },
      repo: contextRepoObject,
    },
    getOctokit: jest.fn(() => ({
      rest: {
        pulls: {
          update: prUpdateSpy,
        },
      },
    })),
  }))
  return { setFailedSpy, errorSpy, prUpdateSpy }
}

describe('#pull-request', () => {
  let ticket: string
  let setFailedSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance
  let prUpdateSpy: jest.SpyInstance

  describe('when jira-account input is missing', () => {
    describe('and when ticket-regex input is also missing', () => {
      beforeAll(async () => {
        jest.resetModules()
        jest.resetAllMocks()
        const options = {
          branch: 'ABC-888-foo-bar',
          jiraAccount: '',
          ticketRegex: '',
        }
        ;({ errorSpy, prUpdateSpy } = await mockContext(options))
        await import('.')
      })

      it('sets error status', () => {
        expect(errorSpy).toHaveBeenCalledWith('Missing required inputs: jira-account, ticket-regex')
      })

      it('does not update PR', () => {
        expect(prUpdateSpy).not.toHaveBeenCalled()
      })
    })

    describe('and when ticket-regex input is provided', () => {
      beforeAll(async () => {
        jest.resetModules()
        jest.resetAllMocks()
        const options = {
          branch: 'AAA-444-foo-bar',
          jiraAccount: '',
          ticketRegex: '^AAA-\\d+-',
        }
        ;({ errorSpy, prUpdateSpy } = await mockContext(options))
        await import('.')
      })

      it('sets error status', () => {
        expect(errorSpy).toHaveBeenCalledWith('Missing required input: jira-account')
      })

      it('does not update PR', () => {
        expect(prUpdateSpy).not.toHaveBeenCalled()
      })
    })

    describe('and when ticket-regex input is provided', () => {
      beforeAll(async () => {
        jest.resetModules()
        jest.resetAllMocks()
        const options = {
          branch: 'AAA-444-foo-bar',
          jiraAccount: '',
          ticketRegex: '^AAA-\\d+-',
        }
        ;({ errorSpy, prUpdateSpy } = await mockContext(options))
        await import('.')
      })

      it('sets error status', () => {
        expect(errorSpy).toHaveBeenCalledWith('Missing required input: jira-account')
      })

      it('does not update PR', () => {
        expect(prUpdateSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('when current branch includes Jira ticket', () => {
    describe('and when PR update request is successful', () => {
      describe('and when PR description already includes preview/Jira links', () => {
        describe('and when links are changing', () => {
          beforeAll(async () => {
            jest.resetModules()
            jest.resetAllMocks()
            ticket = 'ABC-1234'
            const options = {
              branch: `${ticket}-some-feature`,
              updateStatus: HTTP_STATUS_SUCCESS,
              prBody: 'More details',
              ticket,
            }
            ;({ setFailedSpy, errorSpy, prUpdateSpy } = await mockContext(options))
            await import('.')
          })

          it('does not set failed status', () => {
            expect(setFailedSpy).not.toHaveBeenCalled()
            expect(errorSpy).not.toHaveBeenCalled()
          })

          it('updates PR title and current links in description', () => {
            expect(prUpdateSpy).toHaveBeenCalledWith({
              ...DEFAULT_REQUEST_OPTIONS,
              body: `More details\n\n**[Jira ticket](https://account.atlassian.net/browse/${ticket})**`,
            })
          })
        })

        describe('and when links are not changing', () => {
          describe('and when PR title already includes Jira ticket', () => {
            beforeAll(async () => {
              jest.resetModules()
              jest.resetAllMocks()
              ticket = 'ABC-1234'
              const options = {
                branch: `${ticket}-some-feature`,
                updateStatus: HTTP_STATUS_SUCCESS,
                prTitle: `${ticket} - Some feature`,
                prBody: `**[Jira ticket](https://account.atlassian.net/browse/${ticket})**\n\nMore details`,
                ticket,
              }
              ;({ setFailedSpy, errorSpy, prUpdateSpy } = await mockContext(options))
              await import('.')
            })

            it('does not set failed status', () => {
              expect(setFailedSpy).not.toHaveBeenCalled()
              expect(errorSpy).not.toHaveBeenCalled()
            })

            it('does not update PR', () => {
              expect(prUpdateSpy).not.toHaveBeenCalled()
            })
          })
        })
      })

      describe('and when PR description does not include preview/Jira links yet', () => {
        beforeAll(async () => {
          jest.resetModules()
          jest.resetAllMocks()
          ticket = 'ABC-1234'
          const options = {
            branch: `${ticket}-some-feature`,
            updateStatus: HTTP_STATUS_SUCCESS,
            prBody: `body\n\n**[Jira ticket](https://account.atlassian.net/browse/DELTA-123)**`,
            ticket,
          }
          ;({ setFailedSpy, errorSpy, prUpdateSpy } = await mockContext(options))
          await import('.')
        })

        it('does not set failed status', () => {
          expect(setFailedSpy).not.toHaveBeenCalled()
          expect(errorSpy).not.toHaveBeenCalled()
        })

        it('updates PR title and description', () => {
          expect(prUpdateSpy).toHaveBeenCalledWith({
            ...DEFAULT_REQUEST_OPTIONS,
            body: `body\n\n**[Jira ticket](https://account.atlassian.net/browse/${ticket})**`,
          })
        })
      })
    })

    describe('and when PR update request fails', () => {
      beforeAll(async () => {
        jest.resetModules()
        jest.resetAllMocks()
        ticket = 'ABC-1234'
        const options = {
          branch: `${ticket}-some-feature`,
          updateStatus: HTTP_STATUS_ERROR,
          ticket,
        }
        ;({ errorSpy, prUpdateSpy } = await mockContext(options))
        await import('.')
      })

      it('tries to update PR description', () => {
        expect(prUpdateSpy).toHaveBeenCalledWith({
          ...DEFAULT_REQUEST_OPTIONS,
          body: `body\n\n**[Jira ticket](https://account.atlassian.net/browse/${ticket})**`,
        })
      })

      it('sets error status', () => {
        expect(errorSpy).toHaveBeenCalledWith(
          `Updating the pull request has failed with ${HTTP_STATUS_ERROR}`
        )
      })
    })
  })

  describe('when context payload does not include pull_request', () => {
    beforeAll(async () => {
      jest.resetModules()
      jest.resetAllMocks()
      const options = { branch: 'a', hasPullRequestContext: false }

      ;({ setFailedSpy, errorSpy, prUpdateSpy } = await mockContext(options))
      await import('.')
    })

    it('does not set failed status', () => {
      expect(setFailedSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('does not update PR', () => {
      expect(prUpdateSpy).not.toHaveBeenCalled()
    })
  })

  describe('when a runtime error occurs', () => {
    beforeAll(async () => {
      jest.resetModules()
      jest.resetAllMocks()
      ;({ setFailedSpy, prUpdateSpy } = await mockContext({ branch: 'a', contextRepoObject: null }))
      await import('.')
    })

    it('sets failed status', () => {
      expect(setFailedSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot read properties'))
    })

    it('does not update PR', () => {
      expect(prUpdateSpy).not.toHaveBeenCalled()
    })
  })
})
