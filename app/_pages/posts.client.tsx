"use client"

import PageWrapper from '@/components/pageWrapper';
import { SplitText } from '@/components/splitText';
import style from './posts.module.scss'
import Link from 'next/link';

export default function Posts({ posts }) {

  const formatDate = (dateString) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return new Intl.DateTimeFormat('en-US', options).format(new Date(dateString));
  };

  return (
    <PageWrapper className={style.posts}>
      <h1 className={style.header}>
        <SplitText>
          Posts
        </SplitText>
      </h1>
      {posts.nodes.map((node) => {
        return (
          <div key={node.slug}>
            <p className={style.date}>{formatDate(node.date)}</p>
            <Link href={`/posts/${node.slug}`}>
              <div className={style.postLink} dangerouslySetInnerHTML={{ __html: node.title }} />
            </Link>
          </div>
        )
      })}

    </PageWrapper>
  )
}