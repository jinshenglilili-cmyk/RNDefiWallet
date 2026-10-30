import prisma from '../prisma/prisma.js'
import createError from 'http-errors'
const { BadRequest } = createError

class CategoryService {
  /**
   * 获取分类列表
   * @returns {Promise<{categories: *}>} 分类列表
   */
  async getCategories() {
    const categories = await prisma.category.findMany({
      orderBy: [{ rank: 'asc' }, { id: 'desc' }],
    })
    return { categories }
  }

  /**
   * 获取课程列表
   * @param {Object} params - 查询参数
   * @param {number} params.categoryId - 分类ID
   * @param {number} params.page - 当前页码
   * @param {number} params.limit - 每页数量
   * @param {number} params.skip - 跳过的记录数
   * @returns {Promise<Object>} 课程列表和分页信息
   */
  async getCourses({ categoryId, page, limit, skip }) {
    if (!categoryId) {
      throw new BadRequest('获取课程列表失败，分类ID不能为空。')
    }

    const condition = {
      omit: { content: true },
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
      },
      where: { categoryId },
      orderBy: { id: 'desc' },
      take: limit,
      skip: skip,
    }

    const [courses, total] = await prisma.$transaction([
      prisma.course.findMany(condition),
      prisma.course.count({ where: { categoryId } }),
    ])

    return {
      courses,
      pagination: {
        page,
        limit,
        total,
      },
    }
  }
}

export default new CategoryService()
