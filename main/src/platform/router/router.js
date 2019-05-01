import Navigo from 'navigo'
import { load } from './load'

export const create = (outlet) => {
    const r = {
        outlet,
        engine: new Navigo(window.location.origin),
        current: null,
        routes: []
    }

    const navigate = (path) => {
        r.engine.navigate(path, true)
    }

    const unmount = () => {
        if (!r.current) {
            return
        }
        r.current.$destroy()
    }

    const mount = async (route) => {
        if (route.load) {
            await load(route.load)
        }
        await unmount()
        const c = route.component()
        r.current = new c({
            target: r.outlet,
            props: {
                ...route.require
            }
        });
        window.page = r.current
    }  

    const path = (path, route) => {
        r.routes.push({ path, ...route })
    }

    const init = () => {
        if (!outlet) {
            r.outlet = document.createElement('div')
            document.body.appendChild(r.outlet)
        }
        const table = {}
        for (const route of r.routes) {
            if (route.redirectTo) {
                table[route.path] = () => navigate(route.redirectTo)
            }
            if (route.component) {
                table[route.path] = () => mount(route)
            }

        }
        r.engine.on(table).resolve()
    }

    r.navigate = navigate
    r.init = init
    r.path = path
    return r
}
