/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { DownloaderHelper } = require('../dist');
const { byteHelper, pauseTimer } = require('./helpers');
const url = 'http://ipv4.download.thinkbroadband.com/1GB.zip';
const dl = new DownloaderHelper(url, __dirname);

dl
    .on('end', () => console.log('Download Completed'))
    .on('error', err => console.error('Something happend', err))
    .on('stateChanged', state => console.log('State: ', state))
    .once('download', () => pauseTimer(dl, 5000))
    .on('progress', stats => {
        const progress = stats.progress.toFixed(1);
        const speed = byteHelper(stats.speed);
        const downloaded = byteHelper(stats.downloaded);
        const total = byteHelper(stats.total);
        console.log(`${speed}/s - ${progress}% [${downloaded}/${total}]`);
    });

console.log('Downloading: ', url);
dl.start();