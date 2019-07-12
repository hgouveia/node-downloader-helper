# node-downloader-helper

[![NPM Version](https://img.shields.io/npm/v/node-downloader-helper.svg?style=flat-square "npm version")](https://www.npmjs.com/package/node-downloader-helper)
[![Build Status](https://img.shields.io/travis/hgouveia/node-downloader-helper/master.svg?style=flat-square "Build Status")](https://travis-ci.org/hgouveia/node-downloader-helper)
[![Windows Build Status](https://img.shields.io/appveyor/ci/hgouveia/node-downloader-helper/master.svg?label=windows&style=flat-square "Windows Build Status")](https://ci.appveyor.com/project/hgouveia/node-downloader-helper) [![Join the chat at https://gitter.im/node-downloader-helper/Lobby](https://badges.gitter.im/node-downloader-helper/Lobby.svg)](https://gitter.im/node-downloader-helper/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


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

## Options

Download Helper constructor also allow a 3rd parameter to set some options `constructor(url, destinationFolder, options)`,
these are the default values

```javascript
{
    method: 'GET', // Request Method Verb
    headers: {},  // Custom HTTP Header ex: Authorization, User-Agent
    fileName: '', // Custom filename when saved
    retry: false // { maxRetries: number, delay: number in ms } or false to disable (default)
    forceResume: false // If the server does not return the "accept-ranges" header, can be force if it does support it
    override: false, // if true it will override the file, otherwise will append '(number)' to the end of file
    httpRequestOptions: {}, // Override the http request options  
    httpsRequestOptions: {}, // Override the https request options, ex: to add SSL Certs
}
```

for `httpRequestOptions` the available options are detailed in here https://nodejs.org/api/http.html#http_http_request_options_callback

for `httpsRequestOptions` the available options are detailed in here https://nodejs.org/api/https.html#https_https_request_options_callback


## Methods

| Name     	| Description                                                                 	|
|----------	|---------------------------------------------------------------------------	|
| start  	| starts the downloading                                                       	|
| pause  	| pause the downloading                                                        	|
| resume 	| resume the downloading if supported, if not it will start from the beginning 	|
| stop   	| stop the downloading and remove the file                                     	|
| pipe   	| readable.pipe(stream.Writable, options)                                     	|


## Events

| Name        	| Description                                                     	                    |
|--------------	|-----------------------------------------------------------------------------------	|
| start        	| Emitted when the .start method is called                      	                    |
| download     	| Emitted when the download starts                              	                    |
| progress     	| Emitted every 1 second while is downloading `callback(stats)` 	                    |
| retry        	| Emitted when the download fails and retry is enabled `callback(attempt, retryOpts)`   |
| end          	| Emitted when the downloading has finished                     	                    |
| error        	| Emitted when there is any error `callback(error)`              	                    |
| timeout      	| Emitted when the underlying socket times out from inactivity.                         |
| pause        	| Emitted when the .pause method is called                      	                    |
| resume       	| Emitted when the .resume method is called                     	                    |
| stop         	| Emitted when the .stop method is called                       	                    |
| stateChanged 	| Emitted when the state changes `callback(state)`               	                    |

progress `stats` object
```javascript
{
    total:, // total size that needs to be downloaded in bytes
    downloaded:, // downloaded size in bytes
    progress:, // progress porcentage 0-100%
    speed: // download speed in bytes
}
```

## States

| Name         	| Value                            	|
|--------------	|----------------------------------	|
| IDLE         	| 'IDLE'                           	|
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

## Contributing

Read [here](CONTRIBUTING.md) for more information.

## TODO
- Better code testing
