import createError from 'http-errors'
import prisma from '../prisma/prisma.js'

const { NotFound } = createError

class ChapterService {
  /**
   * 获取章节详情
   * @param {number} id - 章节ID
   * @returns {Promise<Object>} 章节详情
   */
  async getChapterDetail(id) {
    const condition = {
      where: { id },
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
            chapters: {
              select: {
                id: true,
                title: true,
                rank: true,
              },
              orderBy: {
                rank: 'asc',
              },
            },
          },
        },
      },
    }

    const result = await prisma.chapter.findUnique(condition)
    if (!result) {
      throw new NotFound(`ID: ${id}的章节未找到。`)
    }

    const { course, ...chapter } = result
    const { user, chapters, ...courseData } = course

    return {
      chapter,
      course: courseData,
      user,
      chapters,
    }
  }
}

export default new ChapterService()
