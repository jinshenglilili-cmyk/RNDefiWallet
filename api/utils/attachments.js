/**
 * 递归处理数据中的媒体文件路径
 * @param {Object} req - Express 请求对象
 * @param {any} data - 需要处理的数据
 * @returns {any} 处理后的数据
 */
export const formatAttachments = (req, data) => {
  if (!data) return data

  // 如果是数组，递归处理每个元素
  if (Array.isArray(data)) {
    return data.map((item) => formatAttachments(req, item))
  }

  // 如果是对象，递归处理每个属性
  if (typeof data === 'object') {
    const result = { ...data }

    // 处理媒体文件路径
    const mediaFields = ['image', 'video', 'avatar']
    for (const field of mediaFields) {
      if (result[field] && typeof result[field] === 'string') {
        // 如果已经是完整的 URL，则跳过
        if (result[field].startsWith('http://') || result[field].startsWith('https://')) {
          continue
        }
        // 拼接完整的 URL
        result[field] = `${req.protocol}://${req.get('host')}${result[field]}`
      }
    }

    // 递归处理对象的其他属性
    for (const key in result) {
      if (typeof result[key] === 'object') {
        result[key] = formatAttachments(req, result[key])
      }
    }

    return result
  }

  // 如果是基本类型，直接返回
  return data
}
