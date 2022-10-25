import Head from "next/head"
import Link from "next/link"
import Layout from "../components/Layout"
import style from "./404.module.scss"

const Custom404 = () => (
  <Layout page="404">
    <Head><title>404</title></Head>
    <h1>Uh oh.</h1>
    <Link className={`btn ${style.btn}`} href="/" scroll={false}>
      Go back
    </Link>
  </Layout>
)

export default Custom404
