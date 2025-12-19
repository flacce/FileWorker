import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import Env from "../utils/Env";
import { createS3Client } from "../utils/utils";


export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env, request } = context;
    const { BUCKET } = env;
    const querys = new URL(request.url).searchParams;
    const maxKeys = querys.get("MaxKeys");
    const prefix = querys.get("Prefix");
    const continuationToken = querys.get("ContinuationToken");

    const s3 = createS3Client(env);
    const command = new ListObjectsV2Command({
        Bucket: BUCKET!,
        MaxKeys: maxKeys ? parseInt(maxKeys) : undefined,
        Prefix: prefix ?? undefined,
        ContinuationToken: continuationToken ?? undefined
    });
    // 执行 S3 列表命令
    let response;
    try {
        response = await s3.send(command);
    } catch (e) {
        const error = e as Error;
        return new Response(JSON.stringify({
            error: error.message || "获取文件列表失败",
            name: error.name,
            stack: error.stack
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
    return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
}