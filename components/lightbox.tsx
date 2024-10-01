import { useState } from 'react';
import Media from "@/components/media"
import style from "@/pages/art.module.scss"

const LightBox = ({ children, media }) => {
	const [isOpen, setIsOpen] = useState(false);

	const toggleIsOpen = () => {
		setIsOpen(!isOpen);
		if (!isOpen) {
			document.querySelector("body")?.classList.add("noscroll")
			document.querySelector("#header")?.classList.add("hidden")
			document.querySelector("#footer")?.classList.add("hidden")
		} else {
			document.querySelector("body")?.classList.remove("noscroll")
			document.querySelector("#header")?.classList.remove("hidden")
			document.querySelector("#footer")?.classList.remove("hidden")
		}
	};

	return (
		<div onClick={toggleIsOpen}>
			{children}
			{isOpen ?
				<div onClick={toggleIsOpen} className={style.lightbox}>
					<div className={style.lightbox__inner}>
						<Media media={media} />
						<div className={style.lightbox__caption}>{media.title}</div>
					</div>
				</div>
				: null}
		</div>
	);
};

export default LightBox;