import createError from 'http-errors'
import multer from 'multer'
import path from 'path'

const { BadRequest } = createError

/**
 * 图片上传
 * @type {DiskStorage}
 */
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/images/')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname)
    const newFilename = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext // 使用当前时间戳作为新文件名
    cb(null, newFilename)
  },
})

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制上传文件的大小为：5MB
  },
  fileFilter: function (req, file, cb) {
    // 只允许上传图片
    const fileType = file.mimetype.split('/')[0]
    const isImage = fileType === 'image'

    if (!isImage) {
      return cb(new BadRequest('只允许上传图片。'))
    }

    cb(null, true)
  },
})

const singleImageUpload = imageUpload.single('file')

/**
 * 视频上传
 * @type {DiskStorage}
 */
const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/videos/')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname)
    const newFilename = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext // 使用当前时间戳作为新文件名
    cb(null, newFilename)
  },
})

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: function (req, file, cb) {
    // 只允许上传视频
    const fileType = file.mimetype.split('/')[0]
    const isVideo = fileType === 'video'

    if (!isVideo) {
      return cb(new BadRequest('只允许上传视频。'))
    }

    cb(null, true)
  },
})

const singleVideoUpload = videoUpload.single('file')

export { singleImageUpload, singleVideoUpload }
