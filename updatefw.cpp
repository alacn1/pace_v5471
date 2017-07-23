/**
* Anderson Luiz Alves
* alacn1@gmail.com
*
* 2017-07-13
*
*
* license: public domain
*
* require: libssl-dev
* compile: g++ -o updatefw updatefw.cpp -lcrypto
*/


#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <openssl/md5.h> // libssl-dev

#include <netdb.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/types.h>



#define SZ_VERSION			"v0.2"

#define ERR					-1
#define ERR_HEADER			-2
#define ERR_CHECKSUM		-3
#define ERR_PARTITION		-4
#define ERR_ARGS			-50
#define ERR_MEM				-100
#define ERR_FILEOPEN		-101
#define ERR_FILECREATE		-102
#define ERR_FILEREAD		-103
#define ERR_FILEWRITE		-104
#define ERR_FILESEEK		-105
#define ERR_FILEEXISTS		-106
#define ERR_SOCKET_ADDRESS	-200
#define ERR_SOCKET_CONNECT	-201
#define ERR_SOCKET_SEND		-202
#define ERR_SOCKET_READ		-203

#define BUFSIZE				4096
#define SENDSIZE			1280
#define SEND_WAIT_MSEC		2

#define PRODCODE			0xB14103
#define RECOVERY_ADDRESS	"239.255.255.240"
#define RECOVERY_PORT		"53428"



bool FORCE = false;



typedef int INT32;
typedef short INT16;

/** bigendian int */
struct INT32B
{
	INT32 value;


	INT32 invert(INT32 v) const
	{
		INT32 ret;

		unsigned char *pret = (unsigned char *)&ret;
		unsigned char *pv = (unsigned char *)&v;

		for(size_t n=0; n<sizeof(v); ++n)
			pret[n] = pv[sizeof(v)-n-1];

		return ret;
	}


	INT32 get() const
	{
		return invert(value);
	}


	void set(INT32 v)
	{
		value = invert(v);
	}


	operator INT32 () const
	{
		return get();
	}


	INT32B& operator = (const INT32 v)
	{
		set(v);
		return *this;
	}


	INT32B& operator += (const INT32 v)
	{
		set(get() + v);
		return *this;
	}


	INT32B& operator -= (const INT32 v)
	{
		set(get() - v);
		return *this;
	}
};



// https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h
// https://github.com/torvalds/linux/blob/master/fs/squashfs/squashfs_fs.h

#define SQUASHFS_MAGIC			0x73717368 // hsqs
#define SQUASHFS_MAGIC_SWAP		0x71736873 // shsq
#define ZLIB_COMPRESSION	1
#define LZMA_COMPRESSION	2
#define LZO_COMPRESSION		3
#define XZ_COMPRESSION		4
#define LZ4_COMPRESSION		5

struct SQUASHFS_SUPERBLOCK
{
	INT32 s_magic;
	INT32 inodes;
	INT32 mkfs_time;
	INT32 block_size;
	INT32 fragments;
	INT16 compression;
	INT16 block_log;
	INT16 flags;
	INT16 no_ids;
	INT16 s_major;
	INT16 s_minor;
};



#define MAX_PARTITION	3
#define CHECKSUM_SIZE	16


struct PARTITION // 284
{
	char name[64]; // size 64?
	INT32B offset;
	INT32B size;
	char unk[212]; // x0
};


struct HEADER // 4096
{
	char copyright[80];		// x0	// Copyright (c) 2006-2010 BeWAN Systems
	char platform[80];		// x50	// V5471 iBoxNG GVT
	char sprodcode[8];		// xa0	// B14103
	char filename[80];		// xa8	// B14103-GVT-RC2-98509.bin
	char date[24];			// xf8	// 2015-03-04-15:55:18

	char releasename[8];	// x110	// GVT-RC2 // size 8?
	char unk0[748];			// x118	// 00

	INT32B bootstatus;		// x404	// 0x4E415742 = will boot, ffffffff on checksum
	INT32B check;			// x408	// 0x4E415742
	INT32B size;			// x40c	// firmware size
	INT32B bootorder;		// x410	// 00000000 on checksum
	INT32B prodcode;		// x414	// 0xB14103
	INT32B svn_version;		// x418

	PARTITION partition[MAX_PARTITION];	// x41c
	char unk1[2176];

	unsigned char checksum[CHECKSUM_SIZE];	// xff0	// md5(0-xff0,x1000-) ^ magic
};


// magics for B14103
const unsigned char CHECKSUM_MAGIC[CHECKSUM_SIZE] = {
	0x0A, 0x20, 0x20, 0x42,
	0x7C, 0x22, 0x61, 0xDB,
	0x12, 0x78, 0xB2, 0x9B,
	0x27, 0xB2, 0xCE, 0x31
};


// firmware recovery fragment
struct FRAGMENT
{
	INT32B seq;
	INT32B unk0;
	INT32B prodcode; // 0x00B14103
	INT32B address; // 0x80800000
	INT32B fwsize;
	INT32B fragsize;
};



int err_mem()
{
	printf("ERROR: memory\n");
	return ERR_MEM;
}


int err_fileopen()
{
	printf("ERROR: file open failed\n");
	return ERR_FILEOPEN;
}


int err_filecreate()
{
	printf("ERROR: file create failed\n");
	return ERR_FILECREATE;
}


int err_fileread()
{
	printf("ERROR: file read failed\n");
	return ERR_FILEREAD;
}


int err_filewrite()
{
	printf("ERROR: file write failed\n");
	return ERR_FILEWRITE;
}


int err_fileseek(int offset)
{
	printf("ERROR: seek offset %X failed\n", offset);
	return ERR_FILESEEK;
}


int err_fileexists()
{
	printf("ERROR: file already exists\n");
	return ERR_FILEEXISTS;
}


int err_header()
{
	printf("ERROR: invalid header\n");
	return ERR_HEADER;
}


int err_socket_address()
{
	printf("ERROR: get socket address failed\n");
	return ERR_SOCKET_ADDRESS;
}


int err_socket_connect()
{
	printf("ERROR: create socket failed\n");
	return ERR_SOCKET_CONNECT;
}


int err_socket_send()
{
	printf("ERROR: socket send failed\n");
	return ERR_SOCKET_SEND;
}



void stripext(char *fname)
{
	char *s = fname;
	while(0 != *s) ++s;

	for(; s > fname; --s)
	{
		if('.' == *s)
		{
			*s = 0;
			break;
		}
		if(('\\' == *s) || ('/' == *s)) break;
	}
}


const char* basename(const char *fname)
{
	const char *s = fname;
	while(0 != *s) ++s;

	for(; s >= fname; --s)
		if(('\\' == *s) || ('/' == *s))
			return s+1;

	return fname;
}


char* changeext(const char *fname, const char *newext)
{
	char *s = (char*)malloc(
		strlen(fname) + sizeof(char) +
		strlen(newext) + sizeof(char));
	if(0 == s) return 0;

	strcpy(s, fname);
	stripext(s);
	strcat(s, ".");
	strcat(s, newext);

	return s;
}


bool exists(const char *fname)
{
	struct stat t;
	return (0 == stat(fname, &t));
}



int getchecksum(FILE *f, unsigned char *checksum, HEADER *header=0)
{
	unsigned char buf[BUFSIZE];

	// read header from file
	if(0 == header)
	{
		if(0 != fseek(f, 0, SEEK_SET))
			return err_fileseek(0);

		clearerr(f);
		if(fread(buf, 1, sizeof(HEADER), f) < sizeof(HEADER))
		{
			if(ferror(f)) return err_fileread();
			return err_header();
		}
	}
	else
	// use arg header
	{
		if(0 != fseek(f, sizeof(HEADER), SEEK_SET))
			return err_fileseek(sizeof(HEADER));

		memcpy(buf, header, sizeof(HEADER));
	}

	// required for checksum
	header = (HEADER*)buf;
	header->bootorder = 0;
	header->bootstatus = 0xffffffff;

	// md5
	MD5_CTX ctx;
	MD5_Init(&ctx);
	MD5_Update(&ctx, header, sizeof(HEADER)-CHECKSUM_SIZE);

	// read data
	clearerr(f);
	for(;;)
	{
		int r = fread(buf, 1, sizeof(buf), f);
		if(r <= 0)
		{
			if(ferror(f)) return err_fileread();
			break;
		}

		MD5_Update(&ctx, buf, r);
	}

	MD5_Final(checksum, &ctx);

	for(int n=0; n<CHECKSUM_SIZE; ++n)
		checksum[n] ^= CHECKSUM_MAGIC[n];

	return 0;
}


int fwinfo(const char *fname)
{
	printf("file: %s\n", fname);

	FILE *f = fopen(fname, "rb");
	if(0 == f) return err_fileopen();

	// load header
	HEADER header;
	clearerr(f);
	if(fread(&header, 1, sizeof(header), f) < sizeof(header))
	{
		if(ferror(f))
		{
			fclose(f);
			return err_fileread();
		}

		fclose(f);
		return err_header();
	}

	// display info
	printf("copyright:     %s\n", header.copyright);
	printf("platform:      %s\n", header.platform);
	printf("sprodcode:     %s\n", header.sprodcode);
	printf("filename:      %s\n", header.filename);
	printf("date:          %s\n", header.date);
	printf("releasename:   %s\n", header.releasename);

	printf("prodcode:      0x%X\n", header.prodcode.get());
	printf("svn version:   %d\n", header.svn_version.get());

	printf("somecheck:     0x%X\n", header.check.get());
	printf("boot status:   0x%X\n", header.bootstatus.get());
	printf("boot order:    %d\n", header.bootorder.get());

	printf("firmware size: %d", header.size.get());

	printf(
		"\n"
		"partitions:\n"
	);
	PARTITION *part = &(header.partition[0]);
	for(int idx=0; idx<MAX_PARTITION; ++idx, ++part)
	{
		// empty?
		if((0 == part->name[0]) && (0 == part->offset) && (0 == part->size)) continue;

		printf(" %d\n", idx);
		printf("  name:   %s\n", part->name);

		int n;
		n = part->offset;
		printf("  offset: %d (0x%X)\n", n, n);

		n = part->size;
		printf("  size:   %d (0x%X)\n", n, n);
	}

	printf(
		"checksum: "
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"\n",
		header.checksum[0],  header.checksum[1],  header.checksum[2],  header.checksum[3],
		header.checksum[4],  header.checksum[5],  header.checksum[6],  header.checksum[7],
		header.checksum[8],  header.checksum[9],  header.checksum[10], header.checksum[11],
		header.checksum[12], header.checksum[13], header.checksum[14], header.checksum[15]
	);

	// verify checksum
	unsigned char verify[CHECKSUM_SIZE];
	int ret = getchecksum(f, verify, &header);

	if(0 != ret)
	{
		fclose(f);
		return ret;
	}

	if(0 == memcmp(header.checksum, verify, sizeof(verify)))
	{
		printf("checksum ok!\n");
	}
	else
	{
		printf(
			"mismatch: "
			"%.2x%.2x%.2x%.2x"
			"%.2x%.2x%.2x%.2x"
			"%.2x%.2x%.2x%.2x"
			"%.2x%.2x%.2x%.2x"
			"\n",
			verify[0],  verify[1],  verify[2],  verify[3],
			verify[4],  verify[5],  verify[6],  verify[7],
			verify[8],  verify[9],  verify[10], verify[11],
			verify[12], verify[13], verify[14], verify[15]
		);
	}

	// file size
	if(0 != fseek(f, 0, SEEK_END))
	{
		fclose(f);
		return err_fileseek(0);
	}
	int fsize = ftell(f);
	if(fsize != header.size)
		printf(
			"WARNING: firmware size %d %s file size %d\n",
			header.size.get(),
			((header.size < fsize)? "<" : ">"),
			fsize
		);

	fclose(f);

	return 0;
}


int fwextractheader(const char *fname, const HEADER *header)
{
	char *dname = changeext(fname, "header");
	if(0 == dname) return err_mem();

	printf("saving %s\n", dname);

	if(exists(dname))
	{
		free(dname);
		return err_fileexists();
	}

	FILE *d = fopen(dname, "w+b");
	if(0 == d)
	{
		free(dname);
		return err_filecreate();
	}

	if(fwrite(header, 1, sizeof(HEADER), d) < sizeof(HEADER))
	{
		fclose(d);
		free(dname);
		return err_filewrite();
	}

	fclose(d);
	free(dname);

	return 0;
}


int fwextractpart(const char *fname, FILE *f, const PARTITION *part, const char *pname)
{
	char *dname = changeext(fname, pname);
	if(0 == dname) return err_mem();

	printf("saving %s\n", dname);

	if(0 != strcmp(pname, part->name))
		printf("WARNING: partition name is not %s\n", pname);

	int size = part->size;
	if(size <= 0)
	{
		free(dname);
		printf("WARNING: empty partition\n");
		return ERR_PARTITION;
	}

	if(0 != fseek(f, part->offset, SEEK_SET))
	{
		free(dname);
		return err_fileseek(part->offset);
	}

	if(exists(dname))
	{
		free(dname);
		return err_fileexists();
	}

	FILE *d = fopen(dname, "w+b");
	if(0 == d)
	{
		free(dname);
		return err_filecreate();
	}

	unsigned char buf[BUFSIZE];

	clearerr(f);
	while(size > 0)
	{
		int r = (size > sizeof(buf))? sizeof(buf) : size;
		size -= r;

		if(fread(buf, 1, r, f) < r)
		{
			fclose(d);
			free(dname);
			return err_fileread();
		}

		if(fwrite(buf, 1, r, d) < r)
		{
			fclose(d);
			free(dname);
			return err_filewrite();
		}
	}

	fclose(d);
	free(dname);

	return 0;
}


int fwextract(const char *fname)
{
	printf("extracting %s\n", fname);

	FILE *f = fopen(fname, "rb");
	if(0 == f) return err_fileopen();

	// load header
	HEADER header;
	clearerr(f);
	if(fread(&header, 1, sizeof(header), f) < sizeof(header))
	{
		if(ferror(f))
		{
			fclose(f);
			return err_fileread();
		}

		fclose(f);
		return err_header();
	}

	// verify checksum
	unsigned char verify[CHECKSUM_SIZE];
	if(
		(0 != getchecksum(f, verify, &header)) ||
		(0 != memcmp(header.checksum, verify, sizeof(verify)))
		)
	{
		printf("WARNING: checksum mismatch!\n");

		if(!FORCE)
		{
			fclose(f);
			printf("use -F to ignore.\n");
			return ERR_CHECKSUM;
		}
	}

	int ret = 0, r;

	// header
	r = fwextractheader(fname, &header);
	if(0 != r) ret = r;

	// partitions
	const char *pnames[] = {
		"kernel",
		"fs",
	};
	PARTITION *part = &(header.partition[0]);
	for(int n=0; n<2; ++n)
	{
		r = fwextractpart(fname, f, part++, pnames[n]);
		if(0 != r) ret = r;
	}

	fclose(f);

	if(0 == ret) printf("done.\n");

	return ret;
}


int partcopy(PARTITION *part, FILE *src, FILE *dst)
{
	if(0 != fseek(src, part->offset, SEEK_SET))
		return err_fileseek(part->offset);

	unsigned char buf[BUFSIZE];
	int size = part->size;

	while(size > 0)
	{
		int r = (size > sizeof(buf))? sizeof(buf) : size;
		size -= r;

		if(fread(buf, 1, r, src) < r)
			return err_fileread();

		if(fwrite(buf, 1, r, dst) < r)
			return err_filewrite();
	}

	return 0;
}


int partimport(PARTITION *part, const char *fpart, FILE *dst)
{
	FILE *f = fopen(fpart, "rb");
	if(0 == f) return err_fileopen();

	unsigned char buf[BUFSIZE];

	int size = 0;

	clearerr(f);
	while(!feof(f))
	{
		int r = fread(buf, 1, sizeof(buf), f);
		if((r < sizeof(buf)) && ferror(f))
		{
			fclose(f);
			return err_fileread();
		}

		if(fwrite(buf, 1, r, dst) < r)
		{
			fclose(f);
			return err_filewrite();
		}

		size += r;
	}

	fclose(f);

	part->size = size;

	return 0;
}


int updatesquashfs(FILE *f, int offset)
{
	SQUASHFS_SUPERBLOCK buf;

	if(0 != fseek(f, offset, SEEK_SET))
		return err_fileseek(offset);

	if(fread(&buf, 1, sizeof(buf), f) < sizeof(buf))
		return err_fileread();

	if((SQUASHFS_MAGIC_SWAP == buf.s_magic) &&
			(ZLIB_COMPRESSION == buf.compression))
		return 0;

	if((SQUASHFS_MAGIC_SWAP != buf.s_magic) &&
		(SQUASHFS_MAGIC != buf.s_magic))
	{
		printf("ERROR: bad squashfs magic\n");
		return ERR_PARTITION;
	}
	buf.s_magic = SQUASHFS_MAGIC_SWAP;

	if((ZLIB_COMPRESSION != buf.compression) &&
		(LZMA_COMPRESSION != buf.compression))
	{
		printf("ERROR: bad squashfs compression\n");
		return ERR_PARTITION;
	}
	buf.compression = ZLIB_COMPRESSION;

	if(0 != fseek(f, offset, SEEK_SET))
		return err_fileseek(offset);

	if(fwrite(&buf, 1, sizeof(buf), f) < sizeof(buf))
		return err_filewrite();

	return 0;
}


int fwupdate(
	const char *fname,
	const char *kernel,
	const char *fs,
	const char *releasename,
	const char *out,
	bool keep
	)
{
	FILE *f = fopen(fname, "rb");
	if(0 == f) return err_fileopen();

	// load header
	HEADER header;
	clearerr(f);
	if(fread(&header, 1, sizeof(header), f) < sizeof(header))
	{
		if(ferror(f))
		{
			fclose(f);
			return err_fileread();
		}

		fclose(f);
		return err_header();
	}

	// verify checksum
	unsigned char verify[CHECKSUM_SIZE];
	if(
		(0 != getchecksum(f, verify, &header)) ||
		(0 != memcmp(header.checksum, verify, sizeof(verify)))
		)
	{
		printf("WARNING: checksum mismatch!\n");

		if(!FORCE)
		{
			fclose(f);
			printf("use -F to ignore.\n");
			return ERR_CHECKSUM;
		}
	}

	// prodcode
	if(header.prodcode != PRODCODE)
	{
		printf("WARNING: prodcode is not 0x%X\n", PRODCODE);

		if(!FORCE)
		{
			fclose(f);
			printf("use -F to ignore.\n");
			return ERR_CHECKSUM;
		}
	}

	// check partitions
	const char *pnames[] = {
		"kernel",
		"fs",
	};
	const char *pname;
	PARTITION *part = &(header.partition[0]);
	for(int n=0; n<2; ++n)
	{
		pname = pnames[n];
		if(0 != strcmp(pname, part->name))
		{
			printf("WARNING: partition %d name is not %s\n", n, pname);

			if(!FORCE)
			{
				fclose(f);
				printf("use -F to ignore.\n");
				return ERR_PARTITION;
			}
		}
		++part;
	}
	if((0 != part->name[0]) || (0 != part->size))
	{
		printf("ERROR: unknown partition\n");
		fclose(f);
		return ERR_PARTITION;
	}

	// out
	printf("file: %s\n", out);

	// header
	memset(header.checksum, 0, sizeof(header.checksum));
	if(!keep)
	{
		header.bootorder = 0;
		header.bootstatus = 0xffffffff;

		// date
		time_t rawtime;
		tm *ti;
		time(&rawtime);
		ti = localtime(&rawtime);
		sprintf(
			header.date,
			"%.4d-%.2d-%.2d-%.2d:%.2d:%.2d",
			ti->tm_year+1900,
			ti->tm_mon+1,
			ti->tm_mday,
			ti->tm_hour,
			ti->tm_min,
			ti->tm_sec
		);

		// fname
		memset(header.filename, 0, sizeof(header.filename));
		strncpy(header.filename, basename(out), sizeof(header.filename));
	}
	header.size = sizeof(HEADER);

	// releasename
	if((0 != releasename) && (0 != *releasename))
	{
		memset(header.releasename, 0, sizeof(header.releasename));
		strncpy(header.releasename, releasename, sizeof(header.releasename)-1);

		if(strlen(header.releasename) < strlen(releasename))
			printf("WARNING: releasename truncated: %s\n", header.releasename);
	}

	if(exists(out))
	{
		fclose(f);
		return err_fileexists();
	}

	// create dest
	FILE *d = fopen(out, "w+b");
	if(0 == d)
	{
		fclose(f);
		return err_filecreate();
	}

	// write header
	if(fwrite(&header, 1, sizeof(HEADER), d) < sizeof(HEADER))
	{
		fclose(f);
		fclose(d);
		return err_filewrite();
	}

	int r;

	// partitions
	const char *pfiles[] = {
		kernel,
		fs
	};
	const char *pfile;
	part = &(header.partition[0]);
	for(int n=0; n<2; ++n, ++part)
	{
		pname = pnames[n];
		pfile = pfiles[n];

		if(0 != pfile)
		{
			printf("importing %s\n", pname);
			r = partimport(part, pfile, d);
		}
		else
		{
			printf("copying %s\n", pname);
			r = partcopy(part, f, d);
		}
		if(0 != r)
		{
			fclose(f);
			fclose(d);
			return r;
		}
		if(part->size <= 0)
		{
			printf("ERROR: %s partition empty\n", pname);
			fclose(f);
			fclose(d);
			return ERR_PARTITION;
		}
		part->offset = header.size;
		header.size += part->size;
	}

	// update squashfs
	part = &(header.partition[1]);
	r = updatesquashfs(d, part->offset);
	if(0 != r)
	{
		fclose(f);
		fclose(d);
		return r;
	}

	// update checksum
	r = getchecksum(d, verify, &header);
	if(0 != r)
	{
		fclose(f);
		fclose(d);
		return r;
	}
	memcpy(header.checksum, verify, sizeof(verify));

	// update header
	printf("updating header\n");
	if(0 != fseek(d, 0, SEEK_SET))
	{
		fclose(f);
		fclose(d);
		return err_fileseek(0);
	}
	if(fwrite(&header, 1, sizeof(HEADER), d) < sizeof(HEADER))
	{
		fclose(f);
		fclose(d);
		return err_filewrite();
	}

	// close
	fclose(f);
	fclose(d);

	// show checksum
	printf(
		"checksum: "
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"%.2x%.2x%.2x%.2x"
		"\n",
		verify[0],  verify[1],  verify[2],  verify[3],
		verify[4],  verify[5],  verify[6],  verify[7],
		verify[8],  verify[9],  verify[10], verify[11],
		verify[12], verify[13], verify[14], verify[15]
	);

	printf("done.\n");
	return 0;
}


void msleep(int msec)
{
	timespec t;
	t.tv_sec = 0;
	t.tv_nsec = 1000000 * msec;
	nanosleep(&t, 0);
}


int recovery(const char *fname)
{
	FILE *f = fopen(fname, "rb");
	if(0 == f) return err_fileopen();

	unsigned char buf[BUFSIZE];
	memset(buf, 0, sizeof(buf));

	// load header
	HEADER *header = (HEADER*)buf;
	clearerr(f);
	if(fread(header, 1, sizeof(HEADER), f) < sizeof(HEADER))
	{
		if(ferror(f))
		{
			fclose(f);
			return err_fileread();
		}

		fclose(f);
		return err_header();
	}

	// verify checksum
	unsigned char verify[CHECKSUM_SIZE];
	if(
		(0 != getchecksum(f, verify, header)) ||
		(0 != memcmp(header->checksum, verify, sizeof(verify)))
		)
	{
		printf("ERROR: bad firmware checksum.\n");
		fclose(f);
		return ERR_CHECKSUM;
	}

	// file size
	if(0 != fseek(f, 0, SEEK_END))
	{
		fclose(f);
		return err_fileseek(0);
	}
	int fsize = ftell(f);

	if(0 != fseek(f, 0, SEEK_SET))
	{
		fclose(f);
		return err_fileseek(0);
	}

	// address info
	addrinfo hints;
	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_INET;
	hints.ai_socktype = SOCK_DGRAM;
	hints.ai_protocol = IPPROTO_UDP;
	hints.ai_flags = AI_NUMERICSERV;

	addrinfo *addrlist = 0;
	if((0 != getaddrinfo(RECOVERY_ADDRESS, RECOVERY_PORT, &hints, &addrlist)) || (0 == addrlist))
	{
		fclose(f);
		return err_socket_address();
	}

	// create socket
	int s = -1;
	for(addrinfo *a=addrlist; 0!=a; a=a->ai_next)
	{
		s = socket(a->ai_family, a->ai_socktype, a->ai_protocol);
		if(-1 == s) continue;

		if(-1 == connect(s, a->ai_addr, a->ai_addrlen))
		{
			close(s);
			continue;
		}

		// success
		break;
	}
	freeaddrinfo(addrlist);

	if(-1 == s)
	{
		fclose(f);
		return err_socket_connect();
	}

	// local address
	sockaddr_in saddr;
	socklen_t saddrlen = sizeof(saddr);
	char host[64];
	memset(host, 0, sizeof(host));

	if(
		(0 == getsockname(s, (sockaddr*)&saddr, &saddrlen)) &&
		(0 == getnameinfo(
			(sockaddr*)&saddr, saddrlen,
			host, sizeof(host),
			0, 0,
			NI_NUMERICHOST | NI_NUMERICSERV))
		)
	{
		printf("from: %s\n", host);
	}

	// firmware fragment
	memset(buf, 0, sizeof(buf));
	FRAGMENT *frag = (FRAGMENT*)buf;
	unsigned char *data = (buf + sizeof(FRAGMENT));

	frag->prodcode = PRODCODE;
	frag->address = 0x80800000;
	frag->fwsize = fsize;

	int q = fsize / 100;
	int p = 0;

	// read and send
	printf("sending to %s:%s...\n", RECOVERY_ADDRESS, RECOVERY_PORT);
	frag->seq = 0;
	clearerr(f);
	for(;;)
	{
		// read
		int r = fread(data, 1, SENDSIZE, f);
		if(r <= 0)
		{
			if(ferror(f))
			{
				close(s);
				fclose(f);
				return err_fileread();
			}
			break;
		}
		frag->fragsize = r;

		// send
		if(-1 == sendto(s, buf, sizeof(FRAGMENT)+r, 0, 0, 0))
		{
			close(s);
			fclose(f);
			return err_socket_send();
		}

		frag->seq += 1;

		p += r;
		if(p >= q)
		{
			p -= q;
			printf(".");
			fflush(stdout);
		}
		msleep(SEND_WAIT_MSEC);
	}
	printf("\n");

	close(s);
	fclose(f);

	printf("done.\n");
	return 0;
}


void info()
{
	printf(
		"updatefw " SZ_VERSION " - " __DATE__ " " __TIME__ "\n"
		"made by Alacn (alacn1@gmail.com)\n"
		"\n"
	);
}


int usage()
{
	printf(
		"Tool to update pace v5471 firmware.\n"
		"usage:\n"
		" info:\n"
		"  updatefw [-i] fw.bin ...\n"
		"  -i  display firmware information\n"
		"\n"
		" extract:\n"
		"  updatefw -x fw.bin ...\n"
		"  -x  extract firmware to fw.header, fw.kernel, fw.fs\n"
		"\n"
		" update:\n"
		"  updatefw -u fw.bin [-k kernel] [-s fs] [-m rel] [-n] -o outfw.bin\n"
		"  -u  update firmware to a new file\n"
		"  -k  set kernel file\n"
		"  -s  set squashfs file\n"
		"  -m  set release name string\n"
		"  -n  keep current value of fields: filename, date, boot\n"
		"  -o  set output file\n"
		"\n"
		" recovery:\n"
		"  updatefw -r fw.bin\n"
		"  -r  upload firmware to router when in recovery mode\n"
	);

	return 0;
}


int err_args()
{
	printf("invalid arguments\n");
	usage();
	return ERR_ARGS;
}


inline int sizeof_checks()
{
	if(sizeof(HEADER) != 4096)
	{
		printf("FATAL: sizeof(HEADER) != 4096\n");
		return ERR;
	}

	if(sizeof(INT32) != 4)
	{
		printf("FATAL: sizeof(INT32) != 4\n");
		return ERR;
	}

	if(sizeof(INT16) != 2)
	{
		printf("FATAL: sizeof(INT16) != 2\n");
		return ERR;
	}

	return 0;
}


int main(int argc, char *argv[])
{
	// compiler should strip this
	if(0 != sizeof_checks()) return ERR;

	if(argc < 2)
	{
		info();
		usage();
		return 0;
	}

	int ret, r, n;

	const char *fname = 0;
	const char *kernel = 0;
	const char *fs = 0;
	const char *out = 0;
	const char *releasename = 0;
	const char *s;
	bool keep = false;

	enum MODE
	{
		MODE_0,
		MODE_INFO,
		MODE_UPDATE,
		MODE_EXTRACT,
		MODE_RECOVERY,
	};
	MODE mode = MODE_0;

	for(n=1; n<argc; ++n)
	{
		s = argv[n];

		if(0 == strcmp("-i", s))
		{
			if((mode != MODE_0) && (mode != MODE_INFO))
				return err_args();
			mode = MODE_INFO;
		}
		else if(0 == strcmp("-x", s))
		{
			if((mode != MODE_0) && (mode != MODE_EXTRACT))
				return err_args();
			mode = MODE_EXTRACT;
		}
		else if(0 == strcmp("-u", s))
		{
			++n;
			if(n >= argc) return err_args();
			fname = argv[n];

			if((mode != MODE_0) && (mode != MODE_UPDATE))
				return err_args();
			mode = MODE_UPDATE;
		}
		else if(0 == strcmp("-k", s))
		{
			++n;
			if(n >= argc) return err_args();
			kernel = argv[n];

			if((mode != MODE_0) && (mode != MODE_UPDATE))
				return err_args();
			mode = MODE_UPDATE;
		}
		else if(0 == strcmp("-s", s))
		{
			++n;
			if(n >= argc) return err_args();
			fs = argv[n];

			if((mode != MODE_0) && (mode != MODE_UPDATE))
				return err_args();
			mode = MODE_UPDATE;
		}
		else if(0 == strcmp("-o", s))
		{
			++n;
			if(n >= argc) return err_args();
			out = argv[n];

			if((mode != MODE_0) && (mode != MODE_UPDATE))
				return err_args();
			mode = MODE_UPDATE;
		}
		else if(0 == strcmp("-m", s))
		{
			++n;
			if(n >= argc) return err_args();
			releasename = argv[n];

			if((mode != MODE_0) && (mode != MODE_UPDATE))
				return err_args();
			mode = MODE_UPDATE;
		}
		else if(0 == strcmp("-r", s))
		{
			++n;
			if(n >= argc) return err_args();
			fname = argv[n];

			if((mode != MODE_0) && (mode != MODE_RECOVERY))
				return err_args();
			mode = MODE_RECOVERY;
		}
		else if(0 == strcmp("-n", s))
		{
			keep = true;
		}
		else if(0 == strcmp("-F", s))
		{
			FORCE = true;
		}
		else if('-' == *s)
		{
			printf("invalid parameter: %s\n", s);
			usage();
			return ERR_ARGS;
		}
		else
		{
			// no mode yet? set MODE_INFO
			if(mode == MODE_0) mode = MODE_INFO;

			// multiple files only in info and extract
			if((mode != MODE_INFO) && (mode != MODE_EXTRACT))
				return err_args();
		}
	}

	switch(mode)
	{
	case MODE_INFO:
		ret = 0;
		for(n=1; n<argc; ++n)
		{
			s = argv[n];
			if('-' == *s) continue;

			r = fwinfo(s);
			if(0 != r) ret = r;

			if(n+1 < argc) printf("\n\n");
		}
		return ret;
	case MODE_EXTRACT:
		ret = 0;
		for(n=1; n<argc; ++n)
		{
			s = argv[n];
			if('-' == *s) continue;

			r = fwextract(s);
			if(0 != r) ret = r;

			if(n+1 < argc) printf("\n\n");
		}
		return ret;
	case MODE_UPDATE:
		if((0 == fname) || (0 == out)) return err_args(); // all required
		if((0 == kernel) && (0 == fs) && (0 == releasename)) return err_args(); // at least one
		return fwupdate(fname, kernel, fs, releasename, out, keep);
	case MODE_RECOVERY:
		return recovery(fname);
	}

	return ERR;
}

