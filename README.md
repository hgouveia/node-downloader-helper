# node-downloader-helper

[![NPM Version](https://img.shields.io/npm/v/node-downloader-helper.svg?style=flat-square "npm version")](https://www.npmjs.com/package/node-downloader-helper)
[![Build Status](https://img.shields.io/travis/hgouveia/node-downloader-helper/master.svg?style=flat-square "Build Status")](https://travis-ci.org/hgouveia/node-downloader-helper)
[![Windows Build Status](https://img.shields.io/appveyor/ci/hgouveia/node-downloader-helper/master.svg?label=windows&style=flat-square "Windows Build Status")](https://ci.appveyor.com/project/hgouveia/node-downloader-helper)


A simple http file downloader for node.js

Features:
- No thirdparty dependecies
- Supports pause/resume
- Supports http/https
- Supports http redirects
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
const dl = new DownloaderHelper('http://ipv4.download.thinkbroadband.com/1GB.zip', __dirname);

dl.on('end', () => console.log('Download Completed'))
dl.start();
```


## Methods

| Name     	| Description                                                                 	|
|----------	|---------------------------------------------------------------------------	|
| start  	| starts the downloading                                                       	|
| pause  	| pause the downloading                                                        	|
| resume 	| resume the downloading if supported, if not it will start from the beginning 	|
| stop   	| stop the downloading and remove the file                                     	|


## Events

| Name        	| Description                                                     	|
|--------------	|-----------------------------------------------------------------	|
| start        	| triggered when the .start method is called                      	|
| download     	| triggered when the download starts                              	|
| progress     	| triggered every 1 second while is downloading `callback(stats)` 	|
| end          	| triggered when the downloading has finished                     	|
| error        	| triggered when there is any error `callback(error)`              	|
| pause        	| triggered when the .pause method is called                      	|
| resume       	| triggered when the .resume method is called                     	|
| stop         	| triggered when the .stop method is called                       	|
| stateChanged 	| triggered when the state changes `callback(state)`               	|

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
| IDLE         	| IDLE                             	|
| STARTED      	| STARTED                          	|
| DOWNLOADING  	| DOWNLOADING                      	|
| PAUSED       	| PAUSED                           	|
| RESUMED      	| RESUMED                          	|
| STOPPED      	| STOPPED                          	|
| FINISHED     	| FINISHED                         	|
| FAILED       	| FAILED                           	|

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