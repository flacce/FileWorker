import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";

import Env from "../utils/Env";

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env, request } = context;
    const { BUCKET, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION } = env;
    const querys = new URL(request.url).searchParams;
    const maxKeys = querys.get("MaxKeys");
    const prefix = querys.get("Prefix");
    const continuationToken = querys.get("ContinuationToken");

    // Initialize AwsClient for signing
    const client = new AwsClient({
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
        service: "s3",
        region: REGION ?? "auto",
    });

    // Construct the S3 ListObjectsV2 URL
    // S3 List URL format: https://{bucket}.{endpoint}/?list-type=2&...
    // Note: Depends on whether path-style or virtual-hosted-style is used.
    // Cloudflare R2 usually supports https://<accountid>.r2.cloudflarestorage.com/<bucket> (path style)
    // or https://<bucket>.<accountid>.r2.cloudflarestorage.com (host style).
    // Let's assume path style based on typical R2 usage with custom domains or direct endpoint usage.
    // If ENDPOINT includes protocol (https://...), we strip it or handle it.

    let url = new URL(ENDPOINT!);
    // Ensure path ends with bucket if it's not already there?
    // Usually R2 ENDPOINT is https://<account>.r2.cloudflarestorage.com
    // So we append bucket to path.
    url.pathname = `/${BUCKET}`;

    url.searchParams.set("list-type", "2");
    if (maxKeys) url.searchParams.set("max-keys", maxKeys);
    if (prefix) url.searchParams.set("prefix", prefix);
    if (continuationToken) url.searchParams.set("continuation-token", continuationToken);

    try {
        const response = await client.fetch(url.toString());

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`S3 responded with ${response.status}: ${errText}`);
        }

        const xmlText = await response.text();

        // Parse XML using fast-xml-parser (No DOM/Node dependency)
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: ""
        });
        const result = parser.parse(xmlText);

        // Handle result structure differences (single item vs array)
        const root = result.ListBucketResult;
        let contents = root.Contents || [];
        if (!Array.isArray(contents)) {
            contents = [contents];
        }

        // Map to expected JSON format
        const mappedContents = contents.map((item: any) => ({
            Key: item.Key,
            Size: parseInt(item.Size),
            LastModified: new Date(item.LastModified),
            ETag: item.ETag
        }));

        const responseStub = {
            Contents: mappedContents,
            IsTruncated: root.IsTruncated === true,
            NextContinuationToken: root.NextContinuationToken,
            KeyCount: root.KeyCount || mappedContents.length,
            MaxKeys: root.MaxKeys,
            Name: root.Name,
            Prefix: root.Prefix
        };

        return new Response(JSON.stringify(responseStub), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

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
}