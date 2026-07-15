import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/dal";

/**
 * Mints short-lived client tokens so the browser can upload derivatives straight
 * to Blob. The photo bytes never pass through this function — that's the whole
 * point: an 872 MB folder cannot fit through a serverless request.
 *
 * The store's real BLOB_READ_WRITE_TOKEN stays on the server and is never sent
 * to the browser. Only logged-in users can mint a token.
 */

const ALLOWED = /^photos\/[0-9a-f-]{36}-(web|thumb)\.webp$/;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // A client token should only ever be able to create a photo derivative.
        if (!ALLOWED.test(pathname)) {
          throw new Error(`Refusing to issue a token for "${pathname}"`);
        }
        return {
          allowedContentTypes: ["image/webp"],
          addRandomSuffix: false,
          maximumSizeInBytes: 12 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // The collection is recorded by /api/collection once every photo is up.
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
