export async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}

export function iterator(num: number) {
    return Array.from(Array(num).keys())
}