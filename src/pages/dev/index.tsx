import { GetStaticProps } from 'next'
import Head from 'next/head'

import Layout from '../../components/Layout';
import Link from 'next/link'
import style from "./dev.module.scss"

import { gql } from "@apollo/client";
import { apolloClient } from "../../data/apolloClient";


const Dev = props => {
  const {
    clients: { nodes },
    page: { dev },
  } = props;


  const GetProjects = () => {
    return (
      <ul className={style.list}>
      {dev["pastProjects"].map((value, i) => {
        const title = value["title"]
        const description = value["description"]
        const link = value["link"]["url"]

        return (
          <li className={style.item} key={"projects"+i}>
            <div className={style.name}>{title}</div>
            <div className={style.description}>{description}</div>
            <a className={`${style.seemore} underline`} href={link} target="_blank" rel="noreferrer">Project link</a>
          </li>
        )
      })}
      </ul>
    )
  }

  return (
    <Layout>
      <Head><title>Developemt</title></Head>

      <div >
        <h1 className={style.header}>Development</h1>

        <div dangerouslySetInnerHTML={{__html:dev.intro}} />

        <h2 className={style.sectionTitle}>Clients</h2>
        <ul className={style.list}>
          {nodes.map((item, i) => (
            <li className={style.item} key={"clients"+i}>
              <div className={style.name}>{item.title}</div>
              <div className={style.date}>{item.client.date}</div>
              <Link className={`${style.seemore} underline`} href="/dev/[slug]" as={`/dev/${item.slug}`} scroll={false}>
                More details
              </Link>
            </li>
          ))}
        </ul>

        <h2 className={style.sectionTitle}>Past Projects</h2>
        <GetProjects />

      </div>
    </Layout>
  )
}


export const getStaticProps: GetStaticProps = async () => {
  const { data, errors } = await apolloClient.query({
    query: gql`
      query {
        clientPosts(where: {orderby: {order: ASC, field: MENU_ORDER}}) {
          nodes {
            title
            slug
            client {
              date
              title
            }
          }
        }
        page(id: "cG9zdDo0MQ==") {
          dev {
            intro
            pastProjects {
              title
              link {
                url
              }
              description
            }
          }
        }
      }
    `,
  });

  if (errors) {
    return <div className="error">My CMS must be down.</div>
  }

  return {
    props: {
      clients: data.clientPosts,
      page: data.page,
    },
    revalidate: 60,
  }
}

export default Dev
