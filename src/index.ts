import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'

const INPUT_GITHUB_TOKEN = 'github-token'
const INPUT_JIRA_ACCOUNT = 'jira-account'
const INPUT_TICKET_REGEX = 'ticket-regex'

const JIRA_LINK_TEXT = 'Jira ticket'

async function run(): Promise<void> {
  try {
    if (!context.payload.pull_request) return

    const token = core.getInput(INPUT_GITHUB_TOKEN)
    const jiraAccount = core.getInput(INPUT_JIRA_ACCOUNT)
    const ticketRegexInput = core.getInput(INPUT_TICKET_REGEX)

    const requiredInputs = {
      [INPUT_JIRA_ACCOUNT]: jiraAccount,
      [INPUT_TICKET_REGEX]: ticketRegexInput,
    }
    const missingRequiredInputs = Object.entries(requiredInputs).filter(([, input]) => !input)

    if (missingRequiredInputs.length) {
      const plural = missingRequiredInputs.length > 1 ? 's' : ''
      const list = missingRequiredInputs.map(([name]) => name).join(', ')
      core.error(`Missing required input${plural}: ${list}`)
      return
    }
    const github = getOctokit(token)
    const ticketRegex = new RegExp(ticketRegexInput)

    const prNumber = context.payload.pull_request.number
    const prTitle = context.payload.pull_request.title || /* istanbul ignore next */ ''
    let prBody = (context.payload.pull_request.body || /* istanbul ignore next */ '')

    const request: Parameters<typeof github.rest.pulls.update>[0] = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    }

    let ticketLine = ''
    const [ticketInTitle] = prTitle.match(ticketRegex) || []

    if (ticketInTitle) {
      const [rawTitle] = prTitle.match(/[A-Z]+-\d+/) || []
      if (rawTitle) {
        const jiraLink = `https://${jiraAccount}.atlassian.net/browse/${rawTitle}`
        ticketLine = `**[${JIRA_LINK_TEXT}](${jiraLink})**`
      }
    }

    const existingJiraRegex = new RegExp(
      `\\*\\*\\[Jira ticket\\]\\(https:\\/\\/${jiraAccount}\\.atlassian\\.net\\/browse\\/[A-Z]+-\\d+\\)\\*\\*`
    )

    if (ticketLine) {
      if (prBody.match(existingJiraRegex)) {
        request.body = prBody.replace(existingJiraRegex, match => {
          return ticketLine
        })
      } else {
        request.body = `${prBody}\n\n${ticketLine}`
      }
    }
    if (request.body) {
      const response = await github.rest.pulls.update(request)

      if (response.status !== 200) {
        core.error(`Updating the pull request has failed with ${response.status}`)
      }
    }
  } catch (error) {
    /* istanbul ignore next */
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    core.setFailed(message)
  }
}

run()
