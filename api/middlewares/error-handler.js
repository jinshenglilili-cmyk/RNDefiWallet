import { failure } from '../utils/responses.js'

export default (err, req, res, next) => {
  failure(res, err)
}
