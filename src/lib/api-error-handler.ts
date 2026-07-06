import { NextResponse } from 'next/server';
import { isDbError } from './db';

/** 数据查询 GET 错误处理：DB 不可用时返回空数据而非 500 */
export function handleGetError(error: any, label: string): NextResponse {
  const msg = error?.message || String(error);
  console.error(`[API Error] ${label}:`, msg);

  if (isDbError(error)) {
    return NextResponse.json({
      error: '数据库暂未连接',
      hint: '请配置 DATABASE_URL 环境变量',
      degraded: true,
    }, { status: 200 });
  }

  return NextResponse.json({ error: msg }, { status: 500 });
}

/** 数据写入 POST/PATCH/DELETE 错误处理：DB 不可用时返回 503 */
export function handleMutationError(error: any, label: string): NextResponse {
  const msg = error?.message || String(error);
  console.error(`[API Error] ${label}:`, msg);

  if (isDbError(error)) {
    return NextResponse.json({
      error: '数据库暂未连接，写入操作不可用',
      hint: '请配置 DATABASE_URL 环境变量',
    }, { status: 503 });
  }

  return NextResponse.json({ error: msg }, { status: 500 });
}
