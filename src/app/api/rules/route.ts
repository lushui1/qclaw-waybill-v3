import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDbError } from '@/lib/db';
import { handleGetError, handleMutationError } from '@/lib/api-error-handler';

// GET: 获取品控规则列表
export async function GET() {
  try {
    const rules = await prisma.qcRule.findMany({
      orderBy: [{ enabled: 'desc' }, { severity: 'desc' }],
    });
    return NextResponse.json(rules);
  } catch (error: any) {
    if (isDbError(error)) return NextResponse.json([]);
    return handleGetError(error, 'GET /api/rules');
  }
}

// POST: 创建/更新品控规则
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, anomalySubtype, condition, severity, autoCreateTicket, autoLevel, enabled, description } = body;

    if (!name || !anomalySubtype || !condition) {
      return NextResponse.json({ error: '缺少必要字段: name, anomalySubtype, condition' }, { status: 400 });
    }

    // 校验 condition 是合法 JSON
    try {
      JSON.parse(typeof condition === 'string' ? condition : JSON.stringify(condition));
    } catch {
      return NextResponse.json({ error: 'condition 必须是合法 JSON' }, { status: 400 });
    }

    const conditionStr = typeof condition === 'string' ? condition : JSON.stringify(condition);

    if (id) {
      const rule = await prisma.qcRule.update({
        where: { id },
        data: {
          name, anomalySubtype,
          condition: conditionStr,
          severity: severity || 'medium',
          autoCreateTicket: autoCreateTicket ?? true,
          autoLevel: autoLevel || 1,
          enabled: enabled ?? true,
          description,
        },
      });
      return NextResponse.json(rule);
    }

    const rule = await prisma.qcRule.create({
      data: {
        name, anomalySubtype,
        condition: conditionStr,
        severity: severity || 'medium',
        autoCreateTicket: autoCreateTicket ?? true,
        autoLevel: autoLevel || 1,
        enabled: enabled ?? true,
        description,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 删除规则
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少规则 ID' }, { status: 400 });
    await prisma.qcRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
