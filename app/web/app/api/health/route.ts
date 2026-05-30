import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ ok: true, authenticated: !!user })
  } catch {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 500 })
  }
}