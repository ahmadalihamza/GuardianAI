import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const demoPath = path.resolve(process.cwd(), "..", "demo", "sample_surveillance.mp4");
    const buffer = await fs.readFile(demoPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'inline; filename="sample_surveillance.mp4"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Demo video not found or could not be read" },
      { status: 404 },
    );
  }
}
