import createError from 'http-errors'
import prisma from '../prisma/prisma.js'

const { NotFound } = createError

class LikeService {
  /**
   * 点赞或取消点赞
   * @param {number} userId - 用户ID
   * @param {number} courseId - 课程ID
   * @returns {Promise<{likesCount: void}>} 操作结果
   */
  async toggleLike(userId, courseId) {
    await this.getCourse(courseId)

    const like = await prisma.like.findFirst({
      where: { courseId, userId },
    })

    if (!like) {
      const likesCount = await this.addLike(courseId, userId)
      return { likesCount }
    } else {
      const likesCount = await this.removeLike(courseId, like.id)
      return { likesCount }
    }
  }

  /**
   * 获取用户点赞的课程列表
   * @param {Object} params - 查询参数
   * @param {number} params.userId - 用户ID
   * @param {number} params.page - 当前页码
   * @param {number} params.limit - 每页数量
   * @param {number} params.skip - 跳过的记录数
   * @returns {Promise<Object>} 课程列表和分页信息
   */
  async getUserLikedCourses({ userId, page, limit, skip }) {
    const condition = {
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            image: true,
            chaptersCount: true,
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatar: true,
                company: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: limit,
      skip: skip,
    }

    const [courses, total] = await prisma.$transaction([
      prisma.like.findMany(condition),
      prisma.like.count({ where: { userId } }), // 添加 count 查询
    ])

    const courseData = courses.map((item) => item.course)

    return {
      courses: courseData,
      pagination: {
        total,
        page,
        limit,
      },
    }
  }

  /**
   * 获取课程信息
   * @param {number} courseId - 课程ID
   * @returns {Promise<Object>} 课程信息
   */
  async getCourse(courseId) {
    if (!courseId) {
      throw new NotFound('请选择课程。')
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
    })

    if (!course) {
      throw new NotFound(`ID 为 ${courseId} 课程不存在。`)
    }

    return course
  }

  /**
   * 新增点赞
   * @param {number} courseId - 课程ID
   * @param {number} userId - 用户ID
   * @returns {Promise<void>}
   */
  async addLike(courseId, userId) {
    await prisma.like.create({
      data: {
        courseId,
        userId,
      },
    })

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        likesCount: { increment: 1 },
      },
    })

    return course.likesCount
  }

  /**
   * 取消点赞
   * @param {number} courseId - 课程ID
   * @param {number} likeId - 点赞记录ID
   * @returns {Promise<void>}
   */
  async removeLike(courseId, likeId) {
    await prisma.like.delete({ where: { id: likeId } })

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        likesCount: { decrement: 1 },
      },
    })

    return course.likesCount
  }
}

export default new LikeService()
