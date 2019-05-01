import * as router from '../platform/router'
import * as item from '../platform/item'
import Home from './views/Home.svelte';

const items = item.createStore()
const r = router.create()

r.path('/', {
    redirectTo: '/home'
})

r.path('/home', {
    component: () => Home,
    require: {
        router: r,
        items
    }
})

r.path('/add', {
    component: () => window.AppAdd,
    require: {
        router: r,
        items
    },
    load: ['/add/add.js', '/add/add.css']
})

r.init()

items.subscribe(console.log)

