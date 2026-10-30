import createError from 'http-errors'
import express from 'express'
import { success, failure } from '../utils/responses.js'
import { singleImageUpload, singleVideoUpload } from '../utils/upload.js'

const router = express.Router()
const { BadRequest } = createError

/**
 * 上传图片
 * POST /uploads/image
 */
router.post('/image', function (req, res) {
  singleImageUpload(req, res, async function (err) {
    if (err) {
      return failure(res, err)
    }

    if (!req.file) {
      return failure(res, new BadRequest('请选择要上传的文件。'))
    }

    const image = `/uploads/images/${req.file.filename}`
    success(res, '上传成功。', {
      image,
      url: `${req.protocol}://${req.get('host')}${image}`,
    })
  })
})

/**
 * 上传视频
 * POST /uploads/video
 */
router.post('/video', function (req, res) {
  singleVideoUpload(req, res, async function (err) {
    if (err) {
      return failure(res, err)
    }

    if (!req.file) {
      return failure(res, new BadRequest('请选择要上传的文件。'))
    }

    const video = `/uploads/videos/${req.file.filename}`
    success(res, '上传成功。', {
      video,
      url: `${req.protocol}://${req.get('host')}${video}`,
    })
  })
})

export default router
