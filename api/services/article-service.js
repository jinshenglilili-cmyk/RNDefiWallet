import prisma from '../prisma/prisma.js'

class ArticleService {
  /**
   * 获取文章列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 当前页码
   * @param {number} params.limit - 每页数量
   * @param {number} params.skip - 跳过的记录数
   * @returns {Promise<Object>} 文章列表和分页信息
   */
  async getArticles({ page, limit, skip }) {
    const condition = {
      omit: { content: true },
      orderBy: { id: 'desc' },
      take: limit,
      skip: skip,
    }

    const [articles, total] = await prisma.$transaction([
      prisma.article.findMany(condition),
      prisma.article.count(),
    ])

    return {
      articles,
      pagination: {
        page,
        limit,
        total,
      },
    }
  }

  /**
   * 获取文章详情
   * @param {number} id - 文章ID
   * @returns {Promise<Object>} 文章详情
   */
  async getArticleDetail(id) {
    const article = await prisma.article.findUnique({ where: { id } })
    return { article }
  }
}

export default new ArticleService()
