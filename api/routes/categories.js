import express from 'express'
import getPagination from '../utils/pagination.js'
import { success } from '../utils/responses.js'
import categoryService from '../services/category-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询分类列表
 * GET /categories
 */
router.get('/', async (req, res, next) => {
  const data = await categoryService.getCategories()
  success(res, '查询分类成功。', data)
})

/**
 * 查询分类对应的课程列表
 * GET /categories/1
 */
router.get('/:id', async (req, res, next) => {
  const id = Number(req.params.id)
  const { page, limit, skip } = getPagination(req)

  const data = await categoryService.getCourses({
    categoryId: id,
    page,
    limit,
    skip,
  })

  success(res, '查询课程列表成功。', formatAttachments(req, data))
})

export default router
