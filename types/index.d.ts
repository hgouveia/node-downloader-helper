import { EventEmitter } from 'events';
import stream from 'stream';

type Stats = {
  total: number;
  name: string;
  downloaded: number;
  progress: number;
  speed: number;
}

export enum DH_STATES {
  IDLE = 'IDLE',
  SKIPPED = 'SKIPPED',
  STARTED = 'STARTED',
  DOWNLOADING = 'DOWNLOADING',
  RETRY = 'RETRY',
  PAUSED = 'PAUSED',
  RESUMED = 'RESUMED',
  STOPPED = 'STOPPED',
  FINISHED = 'FINISHED',
  FAILED = 'FAILED',
}

interface BaseStats {
  /** total file size got from the server */
  totalSize: number | null;
  /** original file name */
  fileName: string;
  /** original path name */
  filePath: string;
  /** the downloaded amount */
  downloadedSize: number;
}

interface DownloadInfoStats extends BaseStats {
  /** if the download is a resume */
  isResumed: boolean;
}

interface DownloadEndedStats extends BaseStats {
  /** total size of file on the disk */
  onDiskSize: number;
  /** true/false if the download endend but still incomplete */
  incomplete: boolean;
}

interface FileRenamedStats {
  /** modified path name */
  path: string;
  /** modified file name */
  fileName: string;
  /** original path name */
  prevPath: string;
  /** original file name */
  prevFileName: string;
}

interface IResumeState {
  downloaded?: number;
  filePath?: string;
  fileName?: string;
  total?: number;
}

interface ErrorStats {
  /** Error message */
  message: string;
  /** Http status response if available */
  status?: number;
  /** Http body response if available */
  body?: string;
}
interface DownloadEvents {
  /** Emitted when the .start method is called */
  start: () => any;
  /** Emitted when the download is skipped because the file already exists */
  skip: (stats: BaseStats) => any;
  /** Emitted when the download starts */
  download: (stats: DownloadInfoStats) => any;
  /**	Emitted every time gets data from the server */
  progress: (stats: Stats) => any;
  /** The same as progress but emits every 1 second while is downloading */
  "progress.throttled": (stats: Stats) => any;
  /** Emitted when the download fails and retry is enabled */
  retry: (attempt: any, retryOptions: RetryOptions, error: Error | null) => any;
  /** Emitted when the downloading has finished */
  end: (stats: DownloadEndedStats) => any;
  /** Emitted when there is any error */
  error: (stats: ErrorStats) => any;
  /**	Emitted when the underlying socket times out from inactivity. */
  timeout: () => any;
  /** Emitted when the .pause method is called */
  pause: () => any;
  /** Emitted when the .resume method is called */
  resume: (isResume: boolean) => any;
  /** Emitted when the .stop method is called */
  stop: () => any;
  /** Emitted when '(number)' is appended to the end of file, this requires override:false opt, callback(filePaths) */
  renamed: (stats: FileRenamedStats) => any;
  /** Emitted when an url redirect happened `callback(newUrl, oldUrl)` NOTE: this will be triggered during getTotalSize() as well */
  redirected: (newUrl: string, oldUrl: string) => any;
  /** Emitted when the state changes */
  stateChanged: (state: DH_STATES) => any;
  /** Emitted when an error occurs that was not thrown intentionally  */
  warning: (error: Error) => any;
}
type FilenameCallback = (fileName: string, filePath: string) => string;
interface FilenameDefinition {
  name: string;
  /** The extension of the file. It may be a boolean: `true` will use the `name` property as the full file name (including the extension),
  `false` will keep the extension of the downloaded file.
  
  (default:false) */
  ext?: string | boolean;
}
interface RetryOptions {
  maxRetries: number;
  /** in milliseconds */
  delay: number;
}
interface OverrideOptions {
  skip?: boolean;
  skipSmaller?: boolean;
}
interface DownloaderHelperOptions {
  /** parameter accepted by http.request write function req.write(body) (default(null)) */
  body?: any;
  /** Request Method Verb */
  method?: "GET" | "PUT" | "POST" | "DELETE" | "OPTIONS",
  /** Custom HTTP Header ex: Authorization, User-Agent */
  headers?: object;
  /** Custom filename when saved */
  fileName?: string | FilenameCallback | FilenameDefinition;
  retry?: boolean | RetryOptions;
  /* Request timeout in milliseconds (-1 use default), is the equivalent of 'httpRequestOptions: { timeout: value }' (also applied to https) */
  timeout?: number;
  /* custom metadata for the user retrieve later */
  metadata?: object | null;
  /** it will resume if a file already exists and is not completed, you might want to set removeOnStop and removeOnFail to false. If you used pipe for compression it will produce corrupted files */
  resumeIfFileExists?: boolean;
  /** If the server does not return the "accept-ranges" header, can be force if it does support it */
  forceResume?: boolean;
  /** remove the file when is stopped (default:true) */
  removeOnStop?: boolean;
  /** remove the file when fail (default:true) */
  removeOnFail?: boolean;
  /** Behavior when local file already exists (default:false)*/
  override?: boolean | OverrideOptions;
  /** interval time of the 'progress.throttled' event will be emitted (default:1000) */
  progressThrottle?: number;
  /** Override the http request options */
  httpRequestOptions?: object;
  /** Override the https request options, ex: to add SSL Certs */
  httpsRequestOptions?: object;
  /** Resume download if the file is incomplete */
  resumeOnIncomplete?: boolean;
  /** Max retry when resumeOnIncomplete is true */
  resumeOnIncompleteMaxRetry?: number;
}
export class DownloaderHelper extends EventEmitter {
  /**
   * Creates an instance of DownloaderHelper.
   * @param {String} url
   * @param {String} destFolder
   * @param {Object} [options={}]
   * @memberof DownloaderHelper
   */
  constructor(url: string, destFolder: string, options?: DownloaderHelperOptions);

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  start(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  pause(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  resume(): Promise<boolean>;

  /**
   *
   *
   * @returns {Promise<boolean>}
   * @memberof DownloaderHelper
   */
  stop(): Promise<boolean>;

  /**
   * Add pipes to the pipe list that will be applied later when the download starts
   * @url https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
   * @param {stream.Readable} stream https://nodejs.org/api/stream.html#stream_class_stream_readable
   * @param {Object} [options=null]
   * @returns {stream.Readable}
   * @memberof DownloaderHelper
   */
  pipe(stream: stream.Readable, options?: object): stream.Readable;

  /**
   * Unpipe an stream , if a stream is not specified, then all pipes are detached.
   *
   * @url https://nodejs.org/api/stream.html#stream_readable_unpipe_destination
   * @param {stream.Readable} [stream=null]
   * @returns
   * @memberof DownloaderHelper
   */
  unpipe(stream?: stream.Readable): void;

  /**
   * Where the download will be saved
   *
   * @returns {String}
   * @memberof DownloaderHelper
   */
  getDownloadPath(): string;

  /**
   * Indicates if the download can be resumable (available after the start phase)
   *
   * @returns {Boolean}
   * @memberof DownloaderHelper
   */
  isResumable(): boolean;

  /**
   * Updates the options, can be use on pause/resume events
   *
   * @param {Object} [options={}]
   * @param {String} [url='']
   * @memberof DownloaderHelper
   */
  updateOptions(options?: object, url?: string): void;

  getOptions(): object;
  getMetadata(): object | null;

  /**
   * Current download progress stats
   *
   * @returns {Stats}
   * @memberof DownloaderHelper
   */
  getStats(): Stats;

  /**
   * Gets the total file size from the server
   *
   * @returns {Promise<{name:string, total:number|null}>}
   * @memberof DownloaderHelper
   */
  getTotalSize(): Promise<{ name: string; total: number | null }>;

  /**
   * Subscribes to events
   * 
   * @memberof EventEmitter
   */
  on<E extends keyof DownloadEvents>(event: E, callback: DownloadEvents[E]): any;

  /**
  * Get the state required to resume the download after restart. This state
  * can be passed back to `resumeFromFile()` to resume a download
  *
  * @returns {IResumeState} Returns the state required to resume
  * @memberof DownloaderHelper
  */
  getResumeState(): IResumeState;

  /**
  * 
  * @param {string} filePath - The path to the file to resume from ex: C:\Users\{user}\Downloads\file.txt
  * @param {IResumeState} state - (optionl) resume download state, if not provided it will try to fetch from the headers and filePath
  *
  * @returns {Promise<boolean>} - Returns the same result as `start()`
  * @memberof DownloaderHelper
  */
  resumeFromFile(filePath: string, state?: IResumeState): Promise<boolean>;
}
