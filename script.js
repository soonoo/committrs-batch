const AWS = require('aws-sdk');
const { github: githubConfig } = require('./config');
const { exec } = require('child_process');

AWS.config.update({
  region: 'us-east-2',
});
const docClient = new AWS.DynamoDB.DocumentClient();

// git client
const Git = require('nodegit');

// github api client
const Octokit = require('@octokit/rest');
const octokit = new Octokit({
  auth: {
    username: githubConfig.username,
    password: githubConfig.password,
    async on2Fa() {
      return prompt('Two factor: ');
    },
  }
});
const query = (...args) => new Promise((resolve, reject) => {
  connection.query(...args, (err, results, fields) => {
    if(err) return reject(err);
    else resolve(results);
  });
});

const put = (param) => new Promise((resolve, reject) => {
  docClient.put(param, (err, data) => {
    if(err) {
      console.log(err)
      reject(err);
    }
    else {
      console.log(data)
      resolve(data);
    }
  });
})

const execPromise = (command) => new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve(stdout.trim());
    });
});


//const user = process.argv[2] || 'soonoo';
let i = 0;
const stargazers_limit = 30;
//const users = ['toxtli', 'brianchandotcom', 'HugoGiraudel', 'kytrinyx', 'sevilayha'];
const users = ['soonoo', 'sindresorhus'];
const cwd = process.cwd();

module.exports = async function() {
  for(user of users) {
    // TODO: users with 100+ repos
    const { data } = await octokit.repos.listForUser({ username: user })

    let repoList = await Promise.all(data.map((repo) => {
      if(repo.fork === false && repo.stargazers_count < stargazers_limit) return;
      else return octokit.repos.get({ owner: user, repo: repo.name });
    })); 
    repoList = repoList.filter(repo => repo);

    for(repo of repoList) {
      const repo_path = repo.data.fork ? repo.data.parent.full_name : repo.data.full_name;

      if((repo.data.source ? repo.data.source.stargazers_count : repo.data.stargazers_count) < stargazers_limit) continue;

      try {
        process.chdir(`${cwd}`)
        await execPromise(`git clone --no-checkout https://github.com/${repo_path} repos/${repo_path}`)
        process.chdir(`${cwd}/repos/${repo_path}`);

        const delimiters = ['---committrs/hash---\n', '---committrs/date---\n', '---committrs/subject---\n', '---committrs/body---\n', '---committrs/files_changed---\n'];
        let log = '';
        try {
          log = await execPromise(`git log --author='${user}' --all --stat --pretty=format:'---committrs/sep---%n---committrs/hash---%n%H%n---committrs/date---%n%aI%n---committrs/subject---%n%s%n---committrs/body---%n%b---committrs/files_changed---'`);
        } catch(e) {
          log = 'trim!!!!';
        }

        if(log) {
          const commits = log.split('---committrs/sep---').slice(1);
          for(commit of commits) {
            const commitData = commit.split(new RegExp(delimiters.join('|'), 'g')).slice(1);
            console.log(commitData)
            await put({
              TableName: 'committrs-commits',
              Item: {
                userName: user,
                commitHash: commitData[0],
                info: {
                  repo_path,
                  date: commitData[1],
                  subject: commitData[2],
                  body: commitData[3] || 'no body',
                  files_changed: commitData[4] || 'no files changed',
                }
              }
            })
          }
        }
      } catch(e) {
      }
    }
  }
};

