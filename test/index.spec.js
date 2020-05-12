const { join } = require('path');
const { DownloaderHelper } = require('../dist');
const { expect } = require('chai');
const { homedir } = require('os');
const fs = require('fs');
jest.mock('fs');

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
    });
});