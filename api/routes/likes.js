import express from 'express'
import getPagination from '../utils/pagination.js'
import { success } from '../utils/responses.js'
import likeService from '../services/like-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 点赞、取消赞
 * POST /likes
 */
router.post('/', async function (req, res) {
  const userId = req.user.id
  const courseId = Number(req.body.courseId)

  const data = await likeService.toggleLike(userId, courseId)
  success(res, '操作成功。', data)
})

/**
 * 查询用户点赞的课程
 * GET /likes
 */
router.get('/', async function (req, res) {
  const { page, limit, skip } = getPagination(req)
  const userId = req.user.id

  const data = await likeService.getUserLikedCourses({
    userId,
    page,
    limit,
    skip,
  })

  success(res, '查询用户点赞的课程成功。', formatAttachments(req, data))
})

export default router
