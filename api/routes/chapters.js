import express from 'express'
import { success } from '../utils/responses.js'
import chapterService from '../services/chapter-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询章节详情
 * GET /chapters/:id
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const data = await chapterService.getChapterDetail(id)

  success(res, '查询章节详情成功。', formatAttachments(req, data))
})

/**
 * 使用 ejs 模板引擎渲染章节详情
 * GET /chapters/:id/info
 */
router.get('/:id/info', async (req, res) => {
  const id = Number(req.params.id)
  const { chapter } = await chapterService.getChapterDetail(id)

  res.render('chapters/info', { chapter })
})

export default router
