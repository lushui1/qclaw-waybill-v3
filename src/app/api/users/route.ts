import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDbError } from '@/lib/db';
import { handleGetError } from '@/lib/api-error-handler';

// 默认用户（数据库不可用时使用）
const DEFAULT_USERS = [
  { id: 'admin-default', username: 'admin', name: '管理员', role: 'admin', warehouse: null, enabled: true },
  { id: 'reporter-default', username: 'reporter', name: '上报员', role: 'reporter', warehouse: null, enabled: true },
  { id: 'l1-app-default', username: 'l1_approver', name: '一级审批人', role: 'level1_approver', warehouse: null, enabled: true },
  { id: 'l2-app-default', username: 'l2_approver', name: '二级审批人', role: 'level2_approver', warehouse: null, enabled: true },
  { id: 'qc-sup-default', username: 'qc_supervisor', name: '品控主管', role: 'qc_supervisor', warehouse: null, enabled: true },
];

// GET: 获取用户列表（简化版）
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, username: true, name: true, role: true, warehouse: true, enabled: true },
    });
    if (users.length === 0) return NextResponse.json(DEFAULT_USERS);
    return NextResponse.json(users);
  } catch (error: any) {
    if (isDbError(error)) return NextResponse.json(DEFAULT_USERS);
    return handleGetError(error, 'GET /api/users');
  }
}

// POST: 创建/更新用户
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, username, name, role, warehouse } = body;

    if (!username || !name || !role) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    if (id) {
      const user = await prisma.user.update({
        where: { id },
        data: { username, name, role, warehouse: warehouse || null },
      });
      return NextResponse.json(user);
    }

    const user = await prisma.user.create({
      data: { username, name, role, warehouse: warehouse || null },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 禁用用户（软删除）
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少用户 ID' }, { status: 400 });

    await prisma.user.update({
      where: { id },
      data: { enabled: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
