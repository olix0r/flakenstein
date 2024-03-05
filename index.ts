import { Octokit } from "@octokit/rest";
import * as dotenv from "dotenv";

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const owner = "linkerd";
const repo = "linkerd2";
const actor = "dependabot[bot]";
const workflow_name = "Integration tests";

async function fetchWorkflowRuns(since: Date) {
  interface PerBranch {
    [branch: string]: number;
  }
  let runsPerBranch: PerBranch = {};
  let attemptsPerBranch: PerBranch = {};

  let totalSuccesses = 0;
  let totalAttempts = 0;
  let totalFailures = 0;

  let page = 0;
  let ready;
  do {
    const response = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      actor,
      status: "completed",
      created: `>=${since.toISOString()}`,
      page: ++page,
    });

    ready = response.data.workflow_runs.length !== 0;
    for (const run of response.data.workflow_runs) {
      const branch = run.head_branch!;
      if (run.name !== workflow_name) {
        continue;
      }
      if (run.conclusion === "success") {
        totalSuccesses++;
        const attempts = run.run_attempt || 1;
        totalAttempts += attempts;
        runsPerBranch[branch] = (runsPerBranch[branch] || 0) + 1;
        attemptsPerBranch[branch] = (attemptsPerBranch[branch] || 0) + attempts;
        if (attempts > 1) {
          totalFailures++;
        }
      }
    }
  } while (ready);

  interface Histo {
    [attempts: number]: number;
  }
  let attemptsHisto = {} as Histo;
  for (const b in attemptsPerBranch) {
    const attempts = attemptsPerBranch[b];
    attemptsHisto[attempts] = (attemptsHisto[attempts] || 0) + 1;
  }

  let runsHisto = {} as Histo;
  let totalBranches = 0;
  for (const b in runsPerBranch) {
    const runs = runsPerBranch[b];
    runsHisto[runs] = (runsHisto[runs] || 0) + 1;
    totalBranches++;
  }

  const runRate = ((totalSuccesses - totalFailures) / totalSuccesses) * 100;
  const attemptRate = (totalSuccesses / totalAttempts) * 100;

  console.log(
    `# ${owner}/${repo} '${workflow_name}' by ${actor} since ${since.toISOString()}`
  );
  console.log("Branches:", totalBranches);
  console.log("Runs:", totalSuccesses);
  console.log("Runs per branch:", runsHisto);
  console.log(`Runs with failures: ${totalFailures}`);
  console.log("Run success rate:", runRate.toFixed(2));
  console.log(`Failed attempts: ${totalAttempts - totalSuccesses}`);
  console.log("Attempts per branch:", attemptsHisto);
  console.log("Attempt success rate:", attemptRate.toFixed(2));
}

const epoch = new Date();
epoch.setMonth(epoch.getMonth() - 1);
fetchWorkflowRuns(epoch).catch(console.error);
