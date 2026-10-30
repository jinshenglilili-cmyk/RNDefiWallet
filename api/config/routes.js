import express from 'express'

// 前台路由文件
import indexRouter from '../routes/index.js'
import articlesRouter from '../routes/articles.js'
import categoriesRouter from '../routes/categories.js'
import coursesRouter from '../routes/courses.js'
import chaptersRouter from '../routes/chapters.js'
import settingsRouter from '../routes/settings.js'
import searchRouter from '../routes/search.js'
import authRouter from '../routes/auth.js'
import usersRouter from '../routes/users.js'
import teachersRouter from '../routes/teachers.js'
import likesRouter from '../routes/likes.js'
import uploadsRouter from '../routes/uploads.js'

// 中间件
import authUser from '../middlewares/auth-user.js'

const router = express.Router()

// 前台路由配置
router.use('/', indexRouter)
router.use('/articles', articlesRouter)
router.use('/categories', categoriesRouter)
router.use('/courses', coursesRouter)
router.use('/chapters', chaptersRouter)
router.use('/settings', settingsRouter)
router.use('/search', searchRouter)
router.use('/auth', authRouter)
router.use('/likes', authUser, likesRouter)
router.use('/users', authUser, usersRouter)
router.use('/teachers', teachersRouter)
router.use('/uploads', authUser, uploadsRouter)

export default router
