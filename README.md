# node-downloader-helper

[![NPM Version](https://img.shields.io/npm/v/node-downloader-helper.svg?style=flat-square "npm version")](https://www.npmjs.com/package/node-downloader-helper)
![npm](https://img.shields.io/npm/dw/node-downloader-helper?style=flat-square "npm download")
[![Build Status](https://img.shields.io/travis/hgouveia/node-downloader-helper/master.svg?style=flat-square "Build Status")](https://travis-ci.org/hgouveia/node-downloader-helper)
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
const dl = new DownloaderHelper('http://www.ovh.net/files/1Gio.dat', __dirname);

dl.on('end', () => console.log('Download Completed'))
dl.start();
```

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
    method: 'GET', // Request Method Verb
    headers: {},  // Custom HTTP Header ex: Authorization, User-Agent
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
| updateOptions   	| `(options)` updates the options, can be use on pause/resume events    |
| getStats  | returns `stats` from the current download, these are the same `stats` sent via progress event  |
| getTotalSize 	| gets the total file size from the server                                  |
| getDownloadPath   | gets the full path where the file will be downloaded (available after the start phase) |
| isResumable   	| return true/false if the download can be resumable (available after the start phase) |


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
| resume       	| Emitted when the .resume method is called `callback(isResume)`   	                    |
| stop         	| Emitted when the .stop method is called                       	                    |
| renamed      	| Emitted when '(number)' is appended to the end of file, this requires `override:false` opt, `callback(filePaths)` |
| stateChanged 	| Emitted when the state changes `callback(state)`               	                    |

event **skip** `skipInfo` object
```javascript
{
    totalSize:, // total file size got from the server
    fileName:, // original file name
    filePath:, // original path name
    downloadedSize:, // the downloaded amount
}
```

event **download** `downloadInfo` object
```javascript
{
    totalSize:, // total file size got from the server
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
    total:, // total size that needs to be downloaded in bytes
    downloaded:, // downloaded size in bytes
    progress:, // progress porcentage 0-100%
    speed: // download speed in bytes
}
```

event **end** `downloadInfo` object
```javascript
{
    fileName:, 
    filePath:,
    totalSize:, // total file size got from the server
    incomplete:, // true/false if the download endend but still incomplete
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
