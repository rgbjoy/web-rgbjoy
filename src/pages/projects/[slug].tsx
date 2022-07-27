import { GetStaticProps, GetStaticPaths } from 'next'
import Head from 'next/head'

import { Project } from '../../interfaces'
import { sampleProjectData } from '../../utils/sample-data'
import ListDetail from '../../components/ListDetail'

type Props = {
  item?: Project
  errors?: string
}

const StaticPropsDetail = ({ item, errors }: Props) => {
  if (errors) {
    return (
      <p>
        <span style={{ color: 'red' }}>Error:</span> {errors}
      </p>
    )
  }

  return (
    <>
      <Head><title>{`${item ? item.name : 'Project Detail'}`}</title></Head>
      <ListDetail item={item} />
    </>
  )
}

export default StaticPropsDetail

export const getStaticPaths: GetStaticPaths = async () => {
  // Get the paths we want to pre-render based on projects
  const paths = sampleProjectData.map((project) => ({
    params: { slug: project.slug },
  }))

  // We'll pre-render only these paths at build time.
  // { fallback: false } means other routes should 404.
  return { paths, fallback: false }
}

// This function gets called at build time on server-side.
// It won't be called on client-side, so you can even do
// direct database queries.
export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const slug = params?.slug
    const item = sampleProjectData.find((data) => data.slug === slug)
    // By returning { props: item }, the StaticPropsDetail component
    // will receive `item` as a prop at build time
    return { props: { item } }
  } catch (err: any) {
    return { props: { errors: err.message } }
  }
}
