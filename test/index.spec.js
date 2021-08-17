const fs = require('fs');
const http = require('http');
const { join } = require('path');
const { homedir } = require('os');
const { expect } = require('chai');
const { DownloaderHelper } = require('../dist');

jest.mock('fs');
jest.mock('http');
jest.mock('https');

// http/https request object
function getRequestFn(requestOptions) {
    return (opts, callback) => {
        callback({
            body: requestOptions.body || '',
            on: jest.fn(),
            pipe: jest.fn(),
            statusCode: requestOptions.statusCode || 200,
            headers: requestOptions.headers || {},
            unpipe: jest.fn(),
        });
        return {
            on: jest.fn(),
            end: jest.fn(),
            abort: jest.fn(),
        };
    };
}

const downloadURL = 'http://www.ovh.net/files/1Gio.dat'; // http://www.ovh.net/files/
describe('DownloaderHelper', function () {

    describe('constructor', function () {
        afterEach(() => {
            jest.resetAllMocks();
        });

        it('should create a instance', function () {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => true });

            expect(function () {
                const dl = new DownloaderHelper(downloadURL, __dirname);
            }).to.not.throw();
        });

        it('should fail if url is not an string', function () {
            expect(function () {
                const dl = new DownloaderHelper(1234, __dirname);
            }).to.throw('URL should be an string');
        });

        it('should fail if url is empty', function () {
            expect(function () {
                const dl = new DownloaderHelper('', __dirname);
            }).to.throw("URL couldn't be empty");
        });

        it('should fail if destination folder is not an string', function () {
            expect(function () {
                const dl = new DownloaderHelper(downloadURL, {});
            }).to.throw('Destination Folder should be an string');
        });

        it('should fail if destination folder is empty', function () {
            expect(function () {
                const dl = new DownloaderHelper(downloadURL, '');
            }).to.throw("Destination Folder couldn't be empty");
        });

        it("should fail if destination folder doesn' exist", function () {
            expect(function () {
                const home = homedir();
                const nonExistingPath = home + '/dh_' + new Date().getTime();
                const dl = new DownloaderHelper(downloadURL, nonExistingPath);
            }).to.throw('Destination Folder must exist');
        });

        it("should fail if destination folder is not a directory", function () {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => false });

            expect(function () {
                const dl = new DownloaderHelper(downloadURL, __dirname);
            }).to.throw('Destination Folder must be a directory');
        });

        it("should fail if destination folder is not writable", function () {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => true });
            fs.accessSync.mockImplementation(() => {
                throw new Error();
            });

            expect(function () {
                const dl = new DownloaderHelper(downloadURL, __dirname);
            }).to.throw('Destination Folder must be writable');
        });

    });

    describe('__getFileNameFromOpts', function () {
        let fileName, fileNameExt;

        beforeEach(function () {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => true });
            fileName = 'myfilename.zip';
            fileNameExt = 'zip';
        });


        it("should return the same file name when an empty string is passed in the 'fileName' opts", function () {
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: ''
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(fileName);
        });


        it("should rename the file name when string is passed in the 'fileName' opts", function () {
            const newFileName = 'mynewname.7z';
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: newFileName
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(newFileName);
        });


        it("should rename the file name when callback is passed in the 'fileName' opts", function () {
            const PREFIX = 'MY_PREFIX_';
            const cb = function (_fileName, _filePath) {
                return PREFIX + _fileName;
            };
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: cb
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(PREFIX + fileName);
        });

        it("callback should return fileName and filePath", function (done) {
            const fullPath = join(__dirname, fileName);
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: function (_fileName, _filePath) {
                    expect(_fileName).to.be.equal(fileName);
                    expect(_filePath).to.be.equal(fullPath);
                    done();
                }
            });
            dl.__getFileNameFromOpts(fileName);
        });

        it("callback should return fileName, filePath and contentType if a response is provided", function (done) {
            const fileNameFromURL = downloadURL.split('/').pop();
            const fullPath = join(__dirname, fileNameFromURL);
            const contentType = 'application/zip';

            fs.createWriteStream.mockReturnValue({ on: jest.fn() });
            http.request.mockImplementation(getRequestFn({
                statusCode: 200,
                headers: {
                    'content-type': contentType,
                }
            }));

            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: function (_fileName, _filePath, _contentType) {
                    expect(_fileName).to.be.equal(fileNameFromURL);
                    expect(_filePath).to.be.equal(fullPath);
                    expect(_contentType).to.be.equal(contentType);
                    done();
                    return fileNameFromURL;
                }
            });
            dl.start();
        });

        it("should rename only the file name and not the extension when a object is passed in the 'fileName' opts with only 'name' attr", function () {
            const newFileName = 'mynewname';
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: { name: newFileName }
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(newFileName + '.' + fileNameExt);
        });

        it("should rename only the file name and not the extension when a object is passed in the 'fileName' opts with 'name' and false 'ext' attr", function () {
            const newFileName = 'mynewname';
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: { name: newFileName, ext: false }
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(newFileName + '.' + fileNameExt);
        });

        it("should rename the file name and custom extension when a object is passed in the 'fileName' opts with 'name' and string 'ext' attr", function () {
            const newFileName = 'mynewname';
            const newFilenameExt = '7z';
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: { name: newFileName, ext: newFilenameExt }
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(newFileName + '.' + newFilenameExt);
        });

        it("should rename the full file name when a object is passed in the 'fileName' opts with 'name' and true in 'ext' attr", function () {
            const newFileName = 'mynewname.7z';
            const dl = new DownloaderHelper(downloadURL, __dirname, {
                fileName: { name: newFileName, ext: true }
            });
            const result = dl.__getFileNameFromOpts(fileName);
            expect(result).to.be.equal(newFileName);
        });

        it("should append '.html' to a file if there is no 'content-disposition' header and no 'path'", function () {
            const newFileName = 'google.html';
            const dl = new DownloaderHelper('https://google.com/', __dirname, {
                fileName: { name: newFileName, ext: true }
            });
            const result = dl.__getFileNameFromHeaders({});
            expect(result).to.be.equal(newFileName);
        });

        it("should *not* append '.html' to a file if there *is* 'content-disposition' header but no 'path'", function () {
            const newFileName = 'filename.jpg';
            const dl = new DownloaderHelper('https://google.com/', __dirname, {
                fileName: { name: newFileName, ext: true }
            });
            const result = dl.__getFileNameFromHeaders({
                'content-disposition': 'Content-Disposition: attachment; filename="' + newFileName + '"',
            });
            expect(result).to.be.equal(newFileName);
        });

        it("should keep leading dots but remove trailing dots for auto-generated file names", function () {
            const newFileName = '.gitignore.';
            const expectedFileName = '.gitignore';
            const dl = new DownloaderHelper('https://google.com/', __dirname, {
                // fileName: { name: newFileName, ext: true }
            });
            const result = dl.__getFileNameFromHeaders({
                'content-disposition': 'Content-Disposition: attachment; filename="' + newFileName + '"',
            });
            expect(result).to.be.equal(expectedFileName);
        });

        it("should not modify the filename when providing a callback", function () {
            const newFileName = '.gitignore.';
            const expectedFileName = newFileName
            const dl = new DownloaderHelper('https://google.com/', __dirname, {
                fileName: () => '.gitignore.'
            });
            const result = dl.__getFileNameFromHeaders({
                'content-disposition': 'Content-Disposition: attachment; filename="' + newFileName + '"',
            });
            expect(result).to.be.equal(expectedFileName);
        });
    });
});