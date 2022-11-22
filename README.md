# node-downloader-helper

[![NPM Version](https://img.shields.io/npm/v/node-downloader-helper.svg?style=flat-square "npm version")](https://www.npmjs.com/package/node-downloader-helper)
![npm](https://img.shields.io/npm/dw/node-downloader-helper?style=flat-square "npm download")
![GitHub Actions Build](https://github.com/hgouveia/node-downloader-helper/actions/workflows/test.yml/badge.svg "GitHub Actions Build")
[![Windows Build Status](https://img.shields.io/appveyor/ci/hgouveia/node-downloader-helper/master.svg?label=windows&style=flat-square "Windows Build Status")](https://ci.appveyor.com/project/hgouveia/node-downloader-helper) [![Join the chat at https://gitter.im/node-downloader-helper/Lobby](https://badges.gitter.im/node-downloader-helper/Lobby.svg)](https://gitter.im/node-downloader-helper/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fhgouveia%2Fnode-downloader-helper.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fhgouveia%2Fnode-downloader-helper?ref=badge_shield)


A simple http file downloader for node.js

Features:
- No thirdparty dependecies
- Pause/Resume
- Retry on fail
- Supports http/https
- Supports http redirects
- Supports pipes
- Custom native http request options
- Usable on vanilla nodejs, electron, nwjs
- Progress stats

## Install

```
$ npm install --save node-downloader-helper
```

## Usage

For a more complete example check [example](example/) folder

```javascript
const { DownloaderHelper } = require('node-downloader-helper');
const dl = new DownloaderHelper('https://proof.ovh.net/files/1Gb.dat', __dirname);

dl.on('end', () => console.log('Download Completed'));
dl.on('error', (err) => console.log('Download Failed', err));
dl.start().catch(err => console.error(err));
```

**IMPORTANT NOTE:** I highly recommend to use both `.on('error')` and `.start().catch`, although they do the same thing, if `on('error')` is not defined, an error will be thrown when the `error` event is emitted and not listing, this is because EventEmitter is designed to throw an `unhandled error event` error if not been listened and is too late to change it now.

### CLI

This can be used as standalone CLI downloader

Install `npm i -g node-downloader-helper`

Usage: `ndh [folder] [url]`

```bash
$ ndh ./folder http://url
```

## Options

Download Helper constructor also allow a 3rd parameter to set some options `constructor(url, destinationFolder, options)`,
these are the default values

```javascript
{
    body: null, //  Request body, can be any, string, object, etc.
    method: 'GET', // Request Method Verb
    headers: {},  // Custom HTTP Header ex: Authorization, User-Agent
    timeout: -1, // Request timeout in milliseconds (-1 use default), is the equivalent of 'httpRequestOptions: { timeout: value }' (also applied to https)
    metadata: {}, // custom metadata for the user retrieve later (default:null)
    resumeOnIncomplete: true, // Resume download if the file is incomplete (set false if using any pipe that modifies the file)
    resumeOnIncompleteMaxRetry: 5, // Max retry when resumeOnIncomplete is true
    resumeIfFileExists: false, // it will resume if a file already exists and is not completed, you might want to set removeOnStop and removeOnFail to false. If you used pipe for compression it will produce corrupted files
    fileName: string|cb(fileName, filePath, contentType)|{name, ext}, // Custom filename when saved
    retry: false, // { maxRetries: number, delay: number in ms } or false to disable (default)
    forceResume: false, // If the server does not return the "accept-ranges" header, can be force if it does support it
    removeOnStop: true, // remove the file when is stopped (default:true)
    removeOnFail: true, // remove the file when fail (default:true)
    progressThrottle: 1000, // interval time of the 'progress.throttled' event will be emitted
    override: boolean|{skip, skipSmaller}, // Behavior when local file already exists
    httpRequestOptions: {}, // Override the http request options  
    httpsRequestOptions: {}, // Override the https request options, ex: to add SSL Certs
}
```
for `body` you can provide any parameter accepted by http.request write function `req.write(body)` https://nodejs.org/api/http.html, when using this, you might need to add the `content-length` and `content-type` header in addition with the http method `POST` or `PUT`

ex: 
```javascript
const data = JSON.stringify({
  todo: 'Buy the milk'
});
const dl = new DownloaderHelper('my_url', __dirname, { 
method: 'POST',
body: data,
headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
} } );
```

for `fileName` you can provide 3 types of parameter
 - **string**: will use the full string as the filename including extension
 - **callback(fileName, filePath, contentType)**: must return an string, only sync function are supported ex: `(fileName) => 'PREFIX_' + fileName;`, **contentType** will be provided if available
 - **object**: this object must contain a `name` attribute and an optional `ext` attribute, the `ext` attribute can be an string without dot(`.`) or a boolean where `true` use the `name` as full file name (same as just giving an string to the `fileName` parameter) or false *(default)* will only replace the name and keep the original extension, for example if the original name is `myfile.zip` and the option is `{name: 'somename'}` the output will be `somename.zip`

for `override` you can provide 2 types of parameter
- **boolean**: `true` to override existing local file, `false` to append '(number)' to new file name
- **object**: object with properties `skip` (boolean): whether to skip download if file exists, and `skipSmaller` (boolean): whether to skip download if file exists but is smaller. Both default to `false`, for the equivalent of `override: true`.

for `httpRequestOptions` the available options are detailed in here https://nodejs.org/api/http.html#http_http_request_options_callback

for `httpsRequestOptions` the available options are detailed in here https://nodejs.org/api/https.html#https_https_request_options_callback


## Methods

| Name     	| Description                                                                 	|
|----------	|---------------------------------------------------------------------------	|
| start  	| starts the downloading                                                       	|
| pause  	| pause the downloading                                                        	|
| resume 	| resume the downloading if supported, if not it will start from the beginning 	|
| stop   	| stop the downloading and remove the file                                     	|
| pipe   	| `readable.pipe(stream.Readable, options) : stream.Readable`                 	|
| unpipe   	| `(stream)`  if not stream is not specified, then all pipes are detached.      |
| updateOptions   	| `(options, url)` updates the options, can be use on pause/resume events    |
| getStats  | returns `stats` from the current download, these are the same `stats` sent via progress event  |
| getTotalSize 	| gets the total file size from the server                                  |
| getDownloadPath   | gets the full path where the file will be downloaded (available after the start phase) |
| isResumable   	| return true/false if the download can be resumable (available after the start phase) |
| getResumeState   	| Get the state required to resume the download after restart. This state can be passed back to `resumeFromFile()` to resume a download |
| resumeFromFile   	| `resumeFromFile(filePath?: string, state?: IResumeState)` Resume the download from a previous file path, if the state is not provided it will try to fetch from the information the headers and filePath, @see `resumeIfFileExists` option |

usage of `resumeFromFile`

```javascript
const downloadDir = 'D:/TEMP';
const { DownloaderHelper } = require('node-downloader-helper');
const dl = new DownloaderHelper('https://proof.ovh.net/files/1Gb.dat', downloadDir);
dl.on('end', () => console.log('Download Completed'));
dl.on('error', (err) => console.log('Download Failed', err));

// option 1
const prevFilePath = `${downloadDir}/1Gb.dat`;
dl.resumeFromFile(prevFilePath).catch(err => console.error(err));

// option 2
const prevState = dl.getResumeState(); // this should be stored in a file, localStorage, db, etc in a previous process for example on 'stop'
dl.resumeFromFile(prevState.filePath, prevState).catch(err => console.error(err));
```

## Events

| Name        	| Description                                                     	                    |
|--------------	|-----------------------------------------------------------------------------------	|
| start        	| Emitted when the .start method is called                      	                    |
| skip        	| Emitted when the download is skipped because the file already exists                  |
| download     	| Emitted when the download starts `callback(downloadInfo)`        	                    |
| progress     	| Emitted every time gets data from the server `callback(stats)` 	                    |
| progress.throttled| The same as `progress` but emits every 1 second while is downloading `callback(stats)` |
| retry        	| Emitted when the download fails and retry is enabled `callback(attempt, retryOpts, err)`   |
| end          	| Emitted when the downloading has finished `callback(downloadInfo)`                    |
| error        	| Emitted when there is any error `callback(error)`              	                    |
| timeout      	| Emitted when the underlying socket times out from inactivity.                         |
| pause        	| Emitted when the .pause method is called                      	                    |
| stop         	| Emitted when the .stop method is called                       	                    |
| resume       	| Emitted when the .resume method is called `callback(isResume)`   	                    |
| renamed      	| Emitted when '(number)' is appended to the end of file, this requires `override:false` opt, `callback(filePaths)` |
| redirected   	| Emitted when an url redirect happened `callback(newUrl, oldUrl)` NOTE: this will be triggered during getTotalSize() as well |
| stateChanged 	| Emitted when the state changes `callback(state)`               	                    |
| warning   	| Emitted when an error occurs that was not thrown intentionally `callback(err: Error)` |

event **skip** `skipInfo` object
```javascript
{
    totalSize:, // total file size got from the server (will be set as 'null' if content-length header is not available)
    fileName:, // original file name
    filePath:, // original path name
    downloadedSize:, // the downloaded amount
}
```

event **download** `downloadInfo` object
```javascript
{
    totalSize:, // total file size got from the server (will be set as 'null' if content-length header is not available)
    fileName:, // assigned name
    filePath:, // download path
    isResumed:, // if the download is a resume,
    downloadedSize:, // the downloaded amount (only if is resumed otherwise always 0)
}
```

event **progress** or **progress.throttled** `stats` object
```javascript
{
    name:, // file name
    total:, // total size that needs to be downloaded in bytes, (will be set as 'null' if content-length header is not available)
    downloaded:, // downloaded size in bytes
    progress:, // progress porcentage 0-100%, (will be set as 0 if total is null)
    speed: // download speed in bytes
}
```

event **end** `downloadInfo` object
```javascript
{
    fileName:, 
    filePath:,
    totalSize:, // total file size got from the server, (will be set as 'null' if content-length header is not available)
    incomplete:, // true/false if the download endend but still incomplete, set as 'false' if totalSize is null
    onDiskSize, // total size of file on the disk
    downloadedSize:, // the total size downloaded
}
```

event **renamed** `filePaths` object
```javascript
{
    path:, // modified path name
    fileName:, // modified file name
    prevPath:, // original path name
    prevFileName:, // original file name
}
```

event **error** `error` object
```javascript
{
    message:, // Error message
    status:, // Http status response if available
    body:, // Http body response if available
}
```

## States

| Name         	| Value                            	|
|--------------	|----------------------------------	|
| IDLE         	| 'IDLE'                           	|
| SKIPPED       | 'SKIPPED'                         |
| STARTED      	| 'STARTED'                        	|
| DOWNLOADING  	| 'DOWNLOADING'                    	|
| PAUSED       	| 'PAUSED'                         	|
| RESUMED      	| 'RESUMED'                        	|
| STOPPED      	| 'STOPPED'                        	|
| FINISHED     	| 'FINISHED'                       	|
| FAILED       	| 'FAILED'                         	|
| RETRY      	| 'RETRY'                         	|

## Test

```
$ npm test
```

## License

Read [License](LICENSE) for more licensing information.


[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fhgouveia%2Fnode-downloader-helper.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fhgouveia%2Fnode-downloader-helper?ref=badge_large)

## Contributing

Read [here](CONTRIBUTING.md) for more information.

## TODO
- Better code testing
