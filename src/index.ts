/* eslint-disable no-undef, no-sync */
import fs from 'fs'
import type { Logger } from 'log4js'

if (process.env.NODE_ENV === 'development') {
    const dotenv = await import('dotenv')
    dotenv.config({
        path: ['.env.local'],
    })
}

let logger: Console | Logger = console
if (process.env.NODE_ENV === 'development') {
    const log4js = (await import('log4js')).default
    logger = log4js.getLogger()
    logger.level = 'debug'
}

// 环境变量；域名
let cookieMap: { [key: string]: string } = {}

// 如果有，则读取 cookie-map.yml
if (fs.existsSync('cookie-map.yml')) {
    logger.info('Reading cookie-map.yml...')
    const YAML = await import('yaml')
    cookieMap = YAML.parse(fs.readFileSync('cookie-map.yml', 'utf8'))?.cookieMap || {}
} else if (fs.existsSync('cookie-map.json')) {   // 如果有，则读取 cookie-map.json
    logger.info('Reading cookie-map.json...')
    cookieMap = JSON.parse(fs.readFileSync('cookie-map.json', 'utf8')).cookieMap || {}
} else {
    logger.info('No cookie-map.yml or cookie-map.json found.')
}

const COOKIE_CLOUD_URL = process.env.COOKIE_CLOUD_URL
const COOKIE_CLOUD_PASSWORD = process.env.COOKIE_CLOUD_PASSWORD

async function getCloudCookie(): Promise<any> {
    if (!COOKIE_CLOUD_URL || !COOKIE_CLOUD_PASSWORD) {
        logger.error('COOKIE_CLOUD_URL or COOKIE_CLOUD_PASSWORD is not set.')
        process.exit(1)
    }
    const url = COOKIE_CLOUD_URL
    const payload = JSON.stringify({ password: COOKIE_CLOUD_PASSWORD })
    const headers = { 'Content-Type': 'application/json' }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
    })

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
}

function encodeCookie(text: string): string {
    return encodeURIComponent(text)
}

function serializeCookie(cookie: { name: string, value: string }): string {
    return `${encodeCookie(cookie.name)}=${encodeCookie(cookie.value)}`
}

// 获取 envKey，名称为 域名大写 + _COOKIES。
// 域名大写不包含后缀，如 bilibili.com 则为 BILIBILI_COOKIES
function getEnvKey(domain: string): string {
    const domainParts = domain.split('.')
    const domainWithoutSuffix = domainParts.at(-2)
    return `${domainWithoutSuffix.toUpperCase()}_COOKIES`
}

async function main() {
    try {
        logger.info('Fetching cloud cookie...')
        const data = await getCloudCookie()
        const { cookie_data } = data
        logger.info('Cloud cookie fetched successfully.')

        let env = ''
        const cookieMapList = Object.entries(cookieMap)

        for (const [key, value] of Object.entries(cookie_data)) {
            if (key === 'weibo.com') { // 跳过 weibo.com
                continue
            }
            const cookies = value as any[]
            const envKey = cookieMapList.find(([k, v]) => v === key)?.[0] || getEnvKey(key)
            if (envKey === 'TWITTER_AUTH_TOKEN') { // TWITTER_AUTH_TOKEN 需要特殊处理
                const authToken = cookies.find((cookie) => cookie.name === 'auth_token')// 只需要 auth_token 即可
                if (authToken) {
                    const authTokenStr = serializeCookie(authToken)
                    const envStr = `${envKey}="${authTokenStr}"\n`
                    env += envStr
                    logger.info(`Processed cookies for domain: ${key}`)
                    continue
                }
            }
            const cookieStr = cookies.map(serializeCookie).join('; ')
            const envStr = `${envKey}="${cookieStr}"\n`
            env += envStr
            logger.info(`Processed cookies for domain: ${key}`)
        }

        env = env.trim()
        logger.info('Writing cookies to .env file...')
        fs.writeFileSync('.env', env, { encoding: 'utf-8' })
        logger.info('.env file written successfully.')
    } catch (error) {
        logger.error('Unexpected error:', error)
    }
}

main()
