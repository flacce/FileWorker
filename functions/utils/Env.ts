export interface Env {
  /** R2 bucket binding */
  BUCKET: R2Bucket
  /** SHA-256 hex of the access password */
  PASSWORD_HASH?: string
  /** Optional plaintext password fallback (if hash not provided) */
  PASSWORD?: string
}

export default Env
