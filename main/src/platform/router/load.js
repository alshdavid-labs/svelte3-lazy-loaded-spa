export const loadCSS = link => new Promise(res => {
    if (document.querySelector(`link[href="${link}"]`)) {
        res()
        return
    }
    const s = document.createElement('link')
    s.href = link
    document.body.appendChild(s)
    res()
})

export const loadScript = link => new Promise(res => {
    if (document.querySelector(`script[src="${link}"]`)) {
        res()
        return
    }
    const s = document.createElement('script')
    s.onload = e => res(e)
    s.src = link
    document.body.appendChild(s)
})

export const load = async items => {
    for (const item of items) {
        if (item.includes('.css')) {
            loadCSS(item)
        }
        if (item.includes('.js')) {
            await loadScript(item)
        }
    }
}