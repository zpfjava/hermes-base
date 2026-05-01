# 飞书多维表格配置

## 表格信息
- **链接**: https://my.feishu.cn/wiki/YnuLwiTJYieGzskxVMQclJvwnjg
- **App Token**: YnuLwiTJYieGzskxVMQclJvwnjg
- **Table ID**: tblfkl9MTRmzCBMb
- **操作凭据**: profile=wechat 的 FEISHU_APP_ID=cli_a92e2febcaf89ccd + FEISHU_APP_SECRET（.env中）

## 表格字段（13列）
1. 序号（数字）
2. 来源账号（文本）
3. 文章标题（文本）
4. 原文链接（链接）
5. 文章类型（单选：干货/故事/推广/认知）
6. 可用度（单选：⭐⭐⭐/⭐⭐/⭐）
7. 标题公式（文本）
8. 标题情绪（文本）
9. 核心结构（文本）
10. 核心钩子（文本）
11. 转化手法（文本）
12. 启发选题（文本）
13. 拆解日期（日期）

## API 操作要点
- 获取 tenant_access_token: POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
- 新增字段: POST https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields
- 追加记录: POST https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records
- 需要权限: bitable:app

## 已有对标记录
1. 老罗 - 抖店副业推广（认知反转+逻辑）
2. 丰哥 - 抖店副业故事版（故事叙事+场景）
3. 峰总创业说 - 3个副业推荐（清单体+中年焦虑）
4. 波哥 - AI野路子（第一人称实操，⭐⭐⭐⭐⭐）
