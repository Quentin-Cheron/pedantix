import { NextResponse } from "next/server";
import { fetchRandomArticle } from "@/lib/wiki";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const article = await fetchRandomArticle();
    return NextResponse.json(article);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
