const mysql = require('mysql');
const { github: githubConfig, db: mysqlConfig } = require('./config');
const connection = mysql.createConnection(mysqlConfig);
const { exec } = require('child_process');

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
const users = ['soonoo'];
//const startTime = new Date();
const cwd = process.cwd();

module.exports = async function() {
  for(user of users) {
    const { data } = await octokit.repos.listForUser({ username: user })

    let repoList = await Promise.all(data.map((repo) => {
      if(repo.fork === false && repo.stargazers_count < stargazers_limit) return;
      else return octokit.repos.get({ owner: user, repo: repo.name });
    })); 
    repoList = repoList.filter(repo => repo);

    let repos = [];
    for(repo of repoList) {
      const repo_path = repo.data.fork ? repo.data.parent.full_name : repo.data.full_name;

      if((repo.data.source ? repo.data.source.stargazers_count : repo.data.stargazers_count) < stargazers_limit) continue;
      try {
        await execPromise(`git clone --no-checkout https://github.com/${repo_path} repos/${repo_path}`)
        repos.push(`${cwd}/repos/${repo_path}`);
      } catch(e) {
        repos.push('');
      }
    }
    repos = repos.filter(path => path);

    for(repo of repos) {
      process.chdir(repo);

      // git log --author='torvalds' --all --stat --since=''
      const log = await execPromise(`git log --author='${user}' --all --stat --pretty=format:'---committrs/subject---%n%s%n---committrs/body---%n%b---committrs/files_changed---'`);

      if(log) {
        const commits = log.split('---committrs/subject---').slice(1);
        for(commit of commits) {
          await query('insert into log(log) values(?)', [commit]);
        }
      }
    }
  }

  //console.log(((new Date()) - startTime)/1000);
  await connection.destroy();
};

