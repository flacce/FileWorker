/** Cloudflare Pages 运行时注入的绑定与环境变量 */
export interface Bindings {
  /** R2 存储桶绑定 */
  BUCKET: R2Bucket
  /** Pages 静态资源服务（Pages Functions 自动注入） */
  ASSETS?: Fetcher
  /** 访问口令的 SHA-256 十六进制摘要（优先） */
  PASSWORD_HASH?: string
  /** 明文访问口令（未配置摘要时使用） */
  PASSWORD?: string
  /** R2 S3 兼容接口凭据，用于签发浏览器直传链接 */
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}

export type AppEnv = { Bindings: Bindings }
