/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { byteHelper } = require('../bin/helpers');
const { DownloaderHelper, DH_STATES } = require('../dist');
const url = 'https://proof.ovh.net/files/1Gb.dat'; // https://proof.ovh.net/files/
const pkg = require('../package.json');
const zlib = require('zlib');

const pauseResumeTimer = (_dl, wait) => {
    setTimeout(() => {
        if (_dl.state === DH_STATES.FINISHED ||
            _dl.state === DH_STATES.FAILED) {
            return;
        }

        _dl.pause()
            .then(() => console.log(`Paused for ${wait / 1000} seconds`))
            .then(() => setTimeout(() => _dl.resume(), wait));

    }, wait);
};

const options = {
    method: 'GET', // Request Method Verb
    // Custom HTTP Header ex: Authorization, User-Agent
    headers: {
        'user-agent': pkg.name + '/' + pkg.version
    },
    retry: { maxRetries: 3, delay: 3000 }, // { maxRetries: number, delay: number in ms } or false to disable (default)
    fileName: filename => `${filename}.gz`, // Custom filename when saved
    /* override
    object: { skip: skip if already exists, skipSmaller: skip if smaller }
    boolean: true to override file, false to append '(number)' to new file name
    */
    metadata: { name: 'download-1' },
    override: { skip: true, skipSmaller: true },
    forceResume: false, // If the server does not return the "accept-ranges" header but it does support it
    removeOnStop: true, // remove the file when is stopped (default:true)
    removeOnFail: true, // remove the file when fail (default:true)    
    httpRequestOptions: {}, // Override the http request options  
    httpsRequestOptions: {} // Override the https request options, ex: to add SSL Certs
};

let startTime = new Date();
const dl = new DownloaderHelper(url, __dirname, options);

dl
    .once('download', () => pauseResumeTimer(dl, 5000))
    .on('download', downloadInfo => console.log('Download Begins: ',
        {
            name: downloadInfo.fileName,
            total: downloadInfo.totalSize
        }))
    .on('end', downloadInfo => console.log('Download Completed: ', downloadInfo))
    .on('skip', skipInfo =>
        console.log('Download skipped. File already exists: ', skipInfo))
    .on('error', err => console.error('Something happened', err))
    .on('retry', (attempt, opts, err) => {
        console.log({
            RetryAttempt: `${attempt}/${opts.maxRetries}`,
            StartsOn: `${opts.delay / 1000} secs`,
            Reason: err ? err.message : 'unknown'
        });
    })
    .on('resume', isResumed => {
        // is resume is not supported,  
        // a new pipe instance needs to be attached
        if (!isResumed) {
            dl.unpipe();
            dl.pipe(zlib.createGzip());
            console.warn("This URL doesn't support resume, it will start from the beginning");
        }
    })
    .on('stateChanged', state => console.log('State: ', state))
    .on('renamed', filePaths => console.log('File Renamed to: ', filePaths.fileName))
    .on('progress', stats => {
        const progress = stats.progress.toFixed(1);
        const speed = byteHelper(stats.speed);
        const downloaded = byteHelper(stats.downloaded);
        const total = byteHelper(stats.total);

        // print every one second (`progress.throttled` can be used instead)
        const currentTime = new Date();
        const elaspsedTime = currentTime - startTime;
        if (elaspsedTime > 1000) {
            startTime = currentTime;
            console.log(`${speed}/s - ${progress}% [${downloaded}/${total}]`);
        }
    });

console.log(`Downloading [${dl.getMetadata().name}]: ${url}`);
dl.pipe(zlib.createGzip()); // Adding example of pipe to compress the file while downloading
dl.start().catch(err => { /* already listening on 'error' event but catch can be used too */ });
