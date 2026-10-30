import createError from 'http-errors'
import jwt from 'jsonwebtoken'
import prisma from '../prisma/prisma.js'

const { NotFound, BadRequest } = createError

class CourseService {
  /**
   * 获取课程详情
   * @param {number} id - 课程ID
   * @param {string} authHeader - 用户token
   * @returns {Promise<Object>} 课程详情
   */
  async getCourseDetail(id, authHeader) {
    const condition = {
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            company: true,
          },
        },
        chapters: {
          select: {
            id: true,
            title: true,
            rank: true,
            createdAt: true,
          },
        },
      },
    }

    const result = await prisma.course.findUnique(condition)
    if (!result) {
      throw new NotFound(`ID: ${id}的课程未找到。`)
    }

    let userLiked = false
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      const decoded = jwt.verify(token, process.env.SECRET)
      const userId = decoded.userId
      const liked = await prisma.like.findFirst({
        where: { userId, courseId: id },
      })
      userLiked = !!liked
    }

    const { category, user, chapters, ...course } = result
    return {
      course,
      category,
      user,
      chapters,
      liked: userLiked,
    }
  }
}


export default new CourseService()
