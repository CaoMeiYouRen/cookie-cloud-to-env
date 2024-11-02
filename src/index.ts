import fs from 'fs'
import dotenv from 'dotenv'
import YAML from 'yaml'
import log4js from 'log4js'

dotenv.config({
    path: ['.env.local'],
})

const logger = log4js.getLogger()
logger.level = 'debug'

// 环境变量；域名
let cookieMap: { [key: string]: string } = {}

// 如果有，则读取 cookie-map.yml
if (fs.existsSync('cookie-map.yml')) {
    cookieMap = YAML.parse(fs.readFileSync('cookie-map.yml', 'utf8'))?.cookieMap || {}
}

const COOKIE_CLOUD_URL = process.env.COOKIE_CLOUD_URL
const COOKIE_CLOUD_PASSWORD = process.env.COOKIE_CLOUD_PASSWORD

async function getCloudCookie(): Promise<any> {
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

        for (const [key, value] of Object.entries(cookie_data)) {
            const cookies = value as any[]
            const cookieStr = cookies.map(serializeCookie).join('; ')
            const envKey = cookieMap[key] || getEnvKey(key)
            const envStr = `${envKey}="${cookieStr}"\n`
            env += envStr
            logger.info(`Processed cookies for domain: ${key}`)
        }

        env = env.trim()
        logger.info('Writing cookies to .env file...')
        // eslint-disable-next-line no-sync
        fs.writeFileSync('.env', env, { encoding: 'utf-8' })
        logger.info('.env file written successfully.')
    } catch (error) {
        logger.error('Unexpected error:', error)
    }
}

main()
