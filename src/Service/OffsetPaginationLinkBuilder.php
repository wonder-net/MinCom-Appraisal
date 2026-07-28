<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\Request;

/**
 * Port of StandardOffsetPagination's count/next/previous/page_size shape,
 * shared by every plain-controller list endpoint (the admin/users
 * ApiResource collection has its own copy in UserAdminCollectionProvider,
 * since it doesn't have access to a Request-based controller the same way).
 *
 * Mirrors DRF's PageNumberPagination.get_next_link()/get_previous_link():
 * the "page" query param is omitted entirely when linking to page 1
 * (DRF's remove_query_param), not just set to "1".
 */
final class OffsetPaginationLinkBuilder
{
    /**
     * @return array{count: int, next: ?string, previous: ?string, page_size: int}
     */
    public function build(Request $request, int $count, int $page, int $pageSize): array
    {
        return [
            'count' => $count,
            'next' => $this->link($request, $page + 1, $pageSize, $count),
            'previous' => $this->link($request, $page - 1, $pageSize, $count),
            'page_size' => $pageSize,
        ];
    }

    private function link(Request $request, int $targetPage, int $pageSize, int $count): ?string
    {
        if ($targetPage < 1) {
            return null;
        }

        $lastPage = $pageSize > 0 ? (int) ceil($count / $pageSize) : 0;
        if ($lastPage === 0 ? $targetPage > 1 : $targetPage > $lastPage) {
            return null;
        }

        $query = $request->query->all();
        if ($targetPage === 1) {
            unset($query['page']);
        } else {
            $query['page'] = (string) $targetPage;
        }

        $queryString = http_build_query($query);

        return $request->getSchemeAndHttpHost().$request->getPathInfo().($queryString !== '' ? '?'.$queryString : '');
    }
}
