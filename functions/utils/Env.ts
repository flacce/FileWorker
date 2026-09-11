export interface Env {
  /** R2 bucket binding */
  BUCKET: R2Bucket
  /** SHA-256 hex of the access password */
  PASSWORD_HASH?: string
  /** Optional plaintext password fallback (if hash not provided) */
  PASSWORD?: string
  /** Optional R2 S3 API credentials for direct presigned uploads */
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}

export default Env
