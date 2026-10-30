import express from 'express'
import getPagination from '../utils/pagination.js'
import { success } from '../utils/responses.js'
import articleService from '../services/article-service.js'

const router = express.Router()

/**
 * 查询文章列表
 * GET /articles
 */
router.get('/', async (req, res, next) => {
  const { page, limit, skip } = getPagination(req)

  const data = await articleService.getArticles({
    page,
    limit,
    skip,
  })
  
  success(res, '查询文章列表成功。', data)
})

/**
 * 查询文章详情
 * GET /articles/:id
 */
router.get('/:id', async (req, res, next) => {
  const id = Number(req.params.id)
  const data = await articleService.getArticleDetail(id)
  success(res, '查询文章详情成功。', data)
})

/**
 * 使用 ejs 模板引擎渲染文章详情
 * GET /articles/:id/info
 */
router.get('/:id/info', async (req, res) => {
  const id = Number(req.params.id)
  const { article } = await articleService.getArticleDetail(id)
  res.render('articles/info', { article })
})

export default router
