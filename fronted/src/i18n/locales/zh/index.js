// 中文文案（默认语言，key 的母本）
// 按域拆分：每个域一个文件，key 结构 <域>.<页面>.<条目>（camelCase）
import common from './common';
import tabs from './tabs';
import auth from './auth';
import wallet from './wallet';
import market from './market';
import defi from './defi';
import browser from './browser';
import wc from './wc';
import settings from './settings';
import errors from './errors';

export default { common, tabs, auth, wallet, market, defi, browser, wc, settings, errors };
